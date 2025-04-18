import pg from 'pg';

const { Pool } = pg
/**
 * Lambda function that consolidates park attractions data by keeping only the first
 * record of consecutive rows with the same attraction_id, attraction_status_id, and stand_by.
 * When any of these values change, it keeps that record and starts a new comparison group.
 * This version works with a PostgreSQL database hosted on Neon.
 */
export const handler = async (event) => {
    let client;
    try {
        // Configure PostgreSQL connection
        const dbConfig = {
          connectionString: process.env.DATABASE_URL
        };
        const pool = new Pool(dbConfig);
        
        client = await pool.connect();
        console.log('Connected to Neon PostgreSQL database');
        
        // Configuration
        const tableName = 'parks.wait';
        const batchSize = parseInt(process.env.BATCH_SIZE || '100');
        const dryRun = process.env.DRY_RUN === 'true';
        
        // Calculate date range (yesterday by default, configurable)
        const daysBack = parseInt(process.env.DAYS_BACK || '1');
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - daysBack);
        const dateStr = targetDate.toISOString().split('T')[0];
        
        console.log(`Processing data for date: ${dateStr} (dry run: ${dryRun})`);
        
        // Query data for the target date
        const rawData = await queryDailyData(client, tableName, dateStr);
        console.log(`Retrieved ${rawData.length} records for date: ${dateStr}`);
        
        if (rawData.length === 0) {
            await client.release();
            return { 
                statusCode: 200, 
                body: `No data to process for ${dateStr}` 
            };
        }
        
        // Sort all data by timestamp chronologically
        rawData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Identify records to keep/delete
        const { recordsToKeep, recordsToDelete } = identifyRecordsToProcess(rawData);
        
        console.log(`Identified ${recordsToDelete.length} records to delete out of ${rawData.length} total records`);
        console.log(`Records to keep: ${recordsToKeep.length}`);
        
        // For logging, show some example IDs that will be kept and deleted
        if (recordsToKeep.length > 0) {
            console.log('IDs to keep (sample):', recordsToKeep.slice(0, 15).map(r => r.id).join(', '));
        }
        if (recordsToDelete.length > 0) {
            console.log('IDs to delete (sample):', recordsToDelete.slice(0, 15).map(r => r.id).join(', '));
        }
        
        // Delete records if not in dry run mode
        let deletedCount = 0;
        if (!dryRun && recordsToDelete.length > 0) {
            deletedCount = await deleteRecordsInBatches(client, tableName, recordsToDelete, batchSize);
            console.log(`Successfully deleted ${deletedCount} redundant records`);
        } else if (dryRun) {
            console.log(`Dry run - would have deleted ${recordsToDelete.length} redundant records`);
        }
        
        // Release the client back to the pool
        await client.release();
        
        // Return success with statistics
        return {
            statusCode: 200,
            body: JSON.stringify({
                date: dateStr,
                totalRecords: rawData.length,
                recordsKept: recordsToKeep.length,
                recordsDeleted: deletedCount,
                compressionRatio: ((recordsToKeep.length / rawData.length) * 100).toFixed(2) + '%',
                dryRun: dryRun
            })
        };
    } catch (error) {
        console.error('Error in data consolidation:', error);
        if (client) {
            await client.release();
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

/**
 * Query all data for a specific date from PostgreSQL
 */
async function queryDailyData(client, tableName, dateStr) {
    // Adjust the query based on your table's structure
    const query = `
        SELECT id, attraction_id, attraction_status_id, stand_by, timestamp
        FROM ${tableName}
        WHERE DATE(created_on) = $1
        ORDER BY timestamp ASC
    `;
    
    const result = await client.query(query, [dateStr]);
    return result.rows;
}

/**
 * Identify records to keep and delete based on the specified logic
 */
function identifyRecordsToProcess(records) {
  if (records.length <= 1) {
      return { recordsToKeep: records, recordsToDelete: [] };
  }
  
  const recordsToKeep = [];
  const recordsToDelete = [];
  
  // First, group records by attraction_id
  const groupedByAttraction = {};
  for (const record of records) {
      const attractionId = record.attraction_id;
      if (!groupedByAttraction[attractionId]) {
          groupedByAttraction[attractionId] = [];
      }
      groupedByAttraction[attractionId].push(record);
  }
  
  // Process each attraction separately
  for (const attractionId in groupedByAttraction) {
      const attractionRecords = groupedByAttraction[attractionId];
      
      // Sort by timestamp to ensure chronological order
      attractionRecords.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Track the current combination within this attraction
      let currentStatusId = null;
      let currentStandBy = null;
      let isFirstMatchingRecord = true;
      
      for (const record of attractionRecords) {
          // Check if this is a new combination
          const isNewCombination = 
              record.attraction_status_id !== currentStatusId ||
              record.stand_by !== currentStandBy;
          
          if (isNewCombination) {
              // New combination found, update tracking variables
              currentStatusId = record.attraction_status_id;
              currentStandBy = record.stand_by;
              isFirstMatchingRecord = true;
          }
          
          if (isFirstMatchingRecord) {
              // Keep the first record of each unique combination
              recordsToKeep.push(record);
              isFirstMatchingRecord = false;
          } else {
              // Delete subsequent records with the same combination
              recordsToDelete.push(record);
          }
      }
  }
  
  return { recordsToKeep, recordsToDelete };
}

/**
 * Delete records in batches for better performance
 */
async function deleteRecordsInBatches(client, tableName, records, batchSize) {
    let totalDeleted = 0;
    
    // Start a transaction for the entire deletion process
    await client.query('BEGIN');
    
    try {
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, Math.min(i + batchSize, records.length));
            const idsToDelete = batch.map(record => record.id);
            
            // Use parameterized query to safely delete by ID
            const placeholders = idsToDelete.map((_, idx) => `$${idx + 1}`).join(',');
            const query = `DELETE FROM ${tableName} WHERE id IN (${placeholders})`;
            
            const result = await client.query(query, idsToDelete);
            totalDeleted += result.rowCount;
            
            console.log(`Deleted batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(records.length/batchSize)}, rows affected: ${result.rowCount}`);
        }
        
        // Commit the transaction if everything succeeded
        await client.query('COMMIT');
        return totalDeleted;
    } catch (error) {
        // Rollback the transaction if any part failed
        await client.query('ROLLBACK');
        console.error('Error during batch delete, transaction rolled back:', error);
        throw error;
    }
}
