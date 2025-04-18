import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client();

/**
 * Marks an S3 file as processed by moving it to a "processed" folder
 * @param {string} bucket - The S3 bucket name
 * @param {string} key - The original file key (path)
 * @returns {Promise<string>} - The new file path
 */
async function markFileAsProcessed(bucket, key) {
    console.log(`Marking file as processed: ${bucket}/${key}`);
    
    try {
        // Create the new key with "processed/" prefix
        // Handle case where the key already has folders
        const keyParts = key.split('/');
        const fileName = keyParts.pop(); // Extract filename
        
        // Two options for marking as processed:
        // 1. Move to a processed folder
        // 2. Add a prefix to the filename
        
        // Option 1: Move to a processed folder
        // let newKey;
        // if (keyParts.length > 0 && keyParts[0] === 'processed') {
        //     // Already in a processed folder
        //     newKey = key;
        //     console.log(`File is already in processed folder: ${newKey}`);
        //     return newKey;
        // } else if (keyParts.length > 0) {
        //     // File is in some folder structure, add processed/ at the beginning
        //     newKey = `processed/${keyParts.join('/')}/${fileName}`;
        // } else {
        //     // File is in root, move to processed folder
        //     newKey = `processed/${fileName}`;
        // }
        
        // Option 2 (alternative): Add -processed suffix to filename
        const fileNameParts = fileName.split('.');
        const extension = fileNameParts.pop();
        const baseName = fileNameParts.join('.');
        const newFileName = `${baseName}-processed.${extension}`;
        const newKey = keyParts.length > 0 ? 
           `${keyParts.join('/')}/${newFileName}` : newFileName;
        
        // Copy the file to the new location
        console.log(`Copying ${key} to ${newKey}`);
        const copyParams = {
            Bucket: bucket,
            CopySource: `${bucket}/${key}`,
            Key: newKey
        };
        
        await s3Client.send(new CopyObjectCommand(copyParams));
        console.log('File copied successfully');
        
        // Delete the original file
        console.log(`Deleting original file: ${key}`);
        const deleteParams = {
            Bucket: bucket,
            Key: key
        };
        
        await s3Client.send(new DeleteObjectCommand(deleteParams));
        console.log('Original file deleted successfully');
        
        return newKey;
    } catch (error) {
        console.error('Error marking file as processed:', error);
        throw error;
    }
}

export default markFileAsProcessed;