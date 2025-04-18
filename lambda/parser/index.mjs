// ES Module version
import pg from 'pg';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import markFileAsProcessed from './mark-file.mjs';

const { Client } = pg;
const s3Client = new S3Client();

export const handler = async (event) => {
    console.log('Lambda started');
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    try {
        // Validate event structure
        if (!event || !event.Records || !event.Records[0] || !event.Records[0].s3) {
            console.error('Invalid event structure:', JSON.stringify(event));
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid event structure' })
            };
        }
        
        // Extract S3 bucket and key information from the event
        console.log('Processing S3 event...');
        
        const record = event.Records[0];
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        
        console.log(`Processing file ${key} from bucket ${bucket}`);
        
        // Database connection configuration
        const dbConfig = {
          connectionString: process.env.DATABASE_URL
        };
        
        console.log('DB config prepared (sensitive info redacted)');
        
        // Get the JSON file from S3
        console.log('Fetching file from S3...');
        let s3Response;
        try {
            const getObjectCommand = new GetObjectCommand({
                Bucket: bucket,
                Key: key
            });
            s3Response = await s3Client.send(getObjectCommand);
            console.log('Successfully retrieved file from S3');
        } catch (s3Error) {
            console.error('Error retrieving file from S3:', s3Error);
            throw s3Error;
        }
        
        // Parse the JSON data
        console.log('Parsing JSON data...');
        let jsonData;
        try {
            // Convert the readable stream to a string
            const bodyContents = await streamToString(s3Response.Body);
            console.log('File content sample:', bodyContents.substring(0, 200) + '...');
            jsonData = JSON.parse(bodyContents);
            console.log('Successfully parsed JSON data');
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
            throw parseError;
        }
        
        // Validate required fields in JSON
        console.log('Validating JSON structure...');
        if (!jsonData.destination || !jsonData.park || !jsonData.data || !jsonData.data.id || !Array.isArray(jsonData.data.liveData)) {
            const error = new Error('Invalid JSON structure: missing required fields');
            console.error(error.message, {
                hasDestination: !!jsonData.destination,
                hasPark: !!jsonData.park,
                hasData: !!jsonData.data,
                hasDataId: jsonData.data ? !!jsonData.data.id : false,
                hasLiveData: jsonData.data ? Array.isArray(jsonData.data.liveData) : false
            });
            throw error;
        }
        console.log('JSON validation successful');
        
        // Initialize database client
        console.log('Initializing database client...');
        const client = new Client(dbConfig);
        
        try {
            // Connect to the database
            console.log('Connecting to database...');
            await client.connect();
            console.log('Connected to database');
            
            // Start a transaction
            console.log('Beginning transaction...');
            await client.query('BEGIN');
            console.log('Transaction started');
            
            // Process destination data
            console.log('Processing destination data...');
            const destinationId = await processDestination(client, jsonData);
            console.log(`Processed destination with ID: ${destinationId}`);
            
            // Process park data
            console.log('Processing park data...');
            const parkId = await processPark(client, jsonData, destinationId);
            console.log(`Processed park with ID: ${parkId}`);
            
            // Process attractions data
            console.log('Processing attractions data...');
            await processAttractions(client, jsonData, parkId);
            console.log('Processed all attractions');
            
            // Commit the transaction
            console.log('Committing transaction...');
            await client.query('COMMIT');
            console.log('Transaction committed successfully');
            
            // Close the database connection
            console.log('Closing database connection...');
            await client.end();
            console.log('Database connection closed');

            // Mark file as processed by moving it to a processed folder
            console.log('Marking file as processed...');
            const newKey = await markFileAsProcessed(bucket, key);
            console.log(`File moved to ${newKey}`);
            
            console.log('Processing completed successfully');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Data successfully processed and stored',
                    file: key
                })
            };
        } catch (dbError) {
            // Rollback the transaction in case of an error
            console.error('Database error:', dbError);
            if (client) {
                console.log('Rolling back transaction...');
                try {
                    await client.query('ROLLBACK');
                    console.log('Transaction rolled back');
                } catch (rollbackError) {
                    console.error('Error during rollback:', rollbackError);
                }
                
                // Close the database connection
                console.log('Closing database connection after error...');
                try {
                    await client.end();
                    console.log('Database connection closed after error');
                } catch (closeError) {
                    console.error('Error closing database connection:', closeError);
                }
            }
            throw dbError;
        }
    } catch (error) {
        console.error('Fatal error processing data:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error processing data',
                error: error.message || 'Unknown error'
            })
        };
    }
};

// Helper function to convert a readable stream to a string
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
}

async function processDestination(client, jsonData) {
    console.log('Checking if destination exists...');
    // Check if the destination already exists
    const checkQuery = 'SELECT id FROM parks.destination WHERE name = $1';
    const checkRes = await client.query(checkQuery, [jsonData.destination]);
    
    if (checkRes.rows.length > 0) {
        // Return existing destination id
        console.log(`Found existing destination with ID: ${checkRes.rows[0].id}`);
        return checkRes.rows[0].id;
    }
    
    console.log('Destination not found, creating new one...');
    // Insert new destination
    const insertQuery = `
        INSERT INTO parks.destination(oid, name, timezone, location)
        VALUES($1, $2, $3, $4)
        RETURNING id
    `;
    
    // Generate a unique OID for destination if not available in the data
    const destinationOid = jsonData.data.id || `destination-${Date.now()}`;
    const timezone = jsonData.data.timezone || 'America/New_York'; // Default timezone if not provided
    const location = jsonData.destination || 'Unknown Location';
    
    console.log('Inserting new destination with params:', {
        oid: destinationOid,
        name: jsonData.destination,
        timezone,
        location
    });
    
    const res = await client.query(insertQuery, [
        destinationOid,
        jsonData.destination,
        timezone,
        location
    ]);
    
    console.log(`Created new destination with ID: ${res.rows[0].id}`);
    return res.rows[0].id;
}

async function processPark(client, jsonData, destinationId) {
    console.log('Checking if park exists...');
    // Check if the park already exists
    const checkQuery = 'SELECT id FROM parks.park WHERE oid = $1';
    const checkRes = await client.query(checkQuery, [jsonData.data.id]);
    
    if (checkRes.rows.length > 0) {
        // Return existing park id
        console.log(`Found existing park with ID: ${checkRes.rows[0].id}`);
        return checkRes.rows[0].id;
    }
    
    console.log('Park not found, creating new one...');
    // Insert new park
    const insertQuery = `
        INSERT INTO parks.park(destination_id, oid, name, location)
        VALUES($1, $2, $3, $4)
        RETURNING id
    `;
    
    console.log('Inserting new park with params:', {
        destination_id: destinationId,
        oid: jsonData.data.id,
        name: jsonData.park,
        location: jsonData.destination
    });
    
    const res = await client.query(insertQuery, [
        destinationId,
        jsonData.data.id,
        jsonData.park,
        jsonData.destination // Using destination as location for simplicity
    ]);
    
    console.log(`Created new park with ID: ${res.rows[0].id}`);
    return res.rows[0].id;
}

async function processAttractions(client, jsonData, parkId) {
    console.log('Processing attractions...');
    // Get timestamp from the original data
    const timestamp = new Date(jsonData.timestamp);
    const liveData = jsonData.data.liveData;
    
    console.log(`Found ${liveData.length} items in liveData array`);
    
    // Process each attraction from the liveData
    let processedCount = 0;
    for (const item of liveData) {
        try {
            // Skip the park entry in liveData if present
            if (item.entityType === 'PARK') {
                console.log(`Skipping PARK entry: ${item.name}`);
                continue;
            }
            
            console.log(`Processing ${item.entityType}: ${item.name}`);
            
            // Get or create attraction type
            const attractionTypeId = await getOrCreateAttractionType(client, item.entityType);
            
            // Get or create attraction
            const attractionId = await getOrCreateAttraction(client, item, parkId, attractionTypeId);
            
            // Get or create attraction status
            const statusId = await getOrCreateAttractionStatus(client, item.status);
            
            // Process wait time and forecast data
            await processWaitTime(client, item, attractionId, statusId, timestamp);
            
            processedCount++;
            console.log(`Successfully processed ${item.name}`);
        } catch (error) {
            console.error(`Error processing attraction ${item.name || 'unknown'}:`, error);
            throw error; // Re-throw to halt processing
        }
    }
    
    console.log(`Successfully processed ${processedCount} attractions`);
}

async function getOrCreateAttractionType(client, entityType) {
    // Check if the attraction type already exists
    const checkQuery = 'SELECT id FROM parks.attraction_type WHERE key = $1';
    const checkRes = await client.query(checkQuery, [entityType]);
    
    if (checkRes.rows.length > 0) {
        // Return existing attraction type id
        return checkRes.rows[0].id;
    }
    
    console.log(`Creating new attraction type: ${entityType}`);
    // Insert new attraction type
    const insertQuery = `
        INSERT INTO parks.attraction_type(key, type_name)
        VALUES($1, $2)
        RETURNING id
    `;
    
    const res = await client.query(insertQuery, [
        entityType,
        entityType.charAt(0) + entityType.slice(1).toLowerCase() // Convert ATTRACTION to Attraction for type_name
    ]);
    
    return res.rows[0].id;
}

async function getOrCreateAttraction(client, item, parkId, attractionTypeId) {
    // Check if the attraction already exists
    const checkQuery = 'SELECT id FROM parks.attraction WHERE oid = $1';
    const checkRes = await client.query(checkQuery, [item.id]);
    
    if (checkRes.rows.length > 0) {
        // Return existing attraction id
        return checkRes.rows[0].id;
    }
    
    console.log(`Creating new attraction: ${item.name}`);
    // Insert new attraction
    // Note: Assuming default lat/long here as they're not in the provided JSON
    const insertQuery = `
        INSERT INTO parks.attraction(park_id, attraction_type_id, oid, name, lat, long)
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING id
    `;
    
    const res = await client.query(insertQuery, [
        parkId,
        attractionTypeId,
        item.id,
        item.name,
        0.0, // Default latitude
        0.0  // Default longitude
    ]);
    
    return res.rows[0].id;
}

async function getOrCreateAttractionStatus(client, status) {
    // If status is not provided, use a default
    const statusKey = status || 'UNKNOWN';
    
    // Check if the status already exists
    const checkQuery = 'SELECT id FROM parks.attraction_status WHERE key = $1';
    const checkRes = await client.query(checkQuery, [statusKey]);
    
    if (checkRes.rows.length > 0) {
        // Return existing status id
        return checkRes.rows[0].id;
    }
    
    console.log(`Creating new attraction status: ${statusKey}`);
    // Insert new status
    const insertQuery = `
        INSERT INTO parks.attraction_status(key, status)
        VALUES($1, $2)
        RETURNING id
    `;
    
    const res = await client.query(insertQuery, [
        statusKey,
        statusKey.charAt(0) + statusKey.slice(1).toLowerCase() // Convert OPERATING to Operating
    ]);
    
    return res.rows[0].id;
}

async function processWaitTime(client, item, attractionId, statusId, timestamp) {
    console.log(`Processing wait time for attraction ID ${attractionId}`);
    // Use the provided timestamp from the JSON data
    const lastUpdated = item.lastUpdated ? new Date(item.lastUpdated) : new Date();
    
    // Get standby wait time (default to -1 if not available)
    let standByWaitTime = -1;
    if (item.queue && item.queue.STANDBY && item.queue.STANDBY.waitTime !== null) {
        standByWaitTime = item.queue.STANDBY.waitTime;
    }
    
    // Process forecast data if available
    let forecastData = null;
    if (item.forecast && Array.isArray(item.forecast) && item.forecast.length > 0) {
        forecastData = JSON.stringify(item.forecast);
    }
    
    // Create metadata object with additional information
    const metadata = item;
    
    console.log(`Inserting wait time with standby: ${standByWaitTime}, timestamp: ${timestamp.toISOString()}`);
    // Insert wait time data
    const insertQuery = `
        INSERT INTO parks.wait(
            attraction_id, 
            attraction_status_id, 
            timestamp, 
            last_updated, 
            stand_by, 
            forecast, 
            metadata
        )
        VALUES($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await client.query(insertQuery, [
        attractionId,
        statusId,
        timestamp,
        lastUpdated,
        standByWaitTime,
        forecastData ? forecastData : null,
        JSON.stringify(metadata)
    ]);
    
    console.log(`Successfully inserted wait time for attraction ID ${attractionId}`);
}