import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fetch from 'node-fetch';
import { DateTime } from 'luxon';

const s3Client = new S3Client({ region: 'us-west-2' });
const BUCKET_NAME = 'wilck-park-data';

const scheduleEndpointTemplate = 'https://api.themeparks.wiki/v1/entity/{{park_id}}/schedule'
const liveDataEndpointTemplate = 'https://api.themeparks.wiki/v1/entity/{{park_id}}/live'

const destinations = [{
        id: "e957da41-3552-4cf6-b636-5babc5cbc4e5",
        name: "Walt Disney World® Resort",
        slug: "waltdisneyworldresort",
        parks: [{
                id: "75ea578a-adc8-4116-a54d-dccb60765ef9",
                name: "Magic Kingdom Park"
            },
            {
                id: "47f90d2c-e191-4239-a466-5892ef59a88b",
                name: "EPCOT"
            },
            {
                id: "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
                name: "Disney's Hollywood Studios"
            },
            {
                id: "1c84a229-8862-4648-9c71-378ddd2c7693",
                name: "Disney's Animal Kingdom Theme Park"
            },
            {
                id: "b070cbc5-feaa-4b87-a8c1-f94cca037a18",
                name: "Disney's Typhoon Lagoon Water Park"
            },
            {
                id: "ead53ea5-22e5-4095-9a83-8c29300d7c63",
                name: "Disney's Blizzard Beach Water Park"
            }
        ]
    },
    {
        id: "bfc89fd6-314d-44b4-b89e-df1a89cf991e",
        name: "Disneyland Resort",
        slug: "disneylandresort",
        parks: [{
                id: "7340550b-c14d-4def-80bb-acdb51d49a66",
                name: "Disneyland Park"
            },
            {
                id: "832fcd51-ea19-4e77-85c7-75d5843b127c",
                name: "Disney California Adventure Park"
            }
        ]
    }
]

async function getAllParksSchedules() {
    const schedules = [];

    for (const destination of destinations) {
        for (const park of destination.parks) {
            try {
                const endpoint = scheduleEndpointTemplate.replace('{{park_id}}', park.id);
                const response = await fetch(endpoint);
                const data = await response.json();
                const timezone = data.timezone
                const now = DateTime.now().setZone(timezone).toJSDate();
                const today = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');

                // Filter schedule for today's operating hours and ticketed events
                const todaySchedules = data.schedule.filter(entry =>
                    entry.date === today &&
                    (entry.type === 'OPERATING' || entry.type === 'TICKETED_EVENT')
                );

                // Sort schedules by time to handle multiple entries
                todaySchedules.sort((a, b) =>
                    new Date(a.openingTime) - new Date(b.openingTime)
                );

                let isOpen = false;
                let currentSchedule = null;

                // Check each schedule period to see if we're currently in it
                for (const schedule of todaySchedules) {
                    const openTime = new Date(schedule.openingTime);
                    const closeTime = new Date(schedule.closingTime);

                    if (now >= openTime && now <= closeTime) {
                        isOpen = true;
                        currentSchedule = schedule;
                        break;
                    }
                }

                schedules.push({
                    destinationName: destination.name,
                    parkName: park.name,
                    isOpen,
                    currentStatus: currentSchedule ? {
                        type: currentSchedule.type,
                        opens: currentSchedule.openingTime,
                        closes: currentSchedule.closingTime,
                        description: currentSchedule.description || null
                    } : null,
                    allTodaySchedules: todaySchedules.map(schedule => ({
                        type: schedule.type,
                        opens: schedule.openingTime,
                        closes: schedule.closingTime,
                        description: schedule.description || null
                    }))
                });
            } catch (error) {
                console.error(`Error fetching schedule for ${park.name}:`, error);
                schedules.push({
                    destinationName: destination.name,
                    parkName: park.name,
                    isOpen: false,
                    currentStatus: null,
                    allTodaySchedules: [],
                    error: error.message
                });
            }
        }
    }

    return schedules;
}

async function init(saveToS3 = false) {
    const parkSchedules = await getAllParksSchedules();
    const timestamp = new Date();
    const monthYear = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}`;

    // Process each park
    for (const parkInfo of parkSchedules) {
        try {
            // Only fetch live data if park is open
            if (parkInfo.isOpen) {
                const park = destinations
                    .flatMap(d => d.parks)
                    .find(p => p.name === parkInfo.parkName);

                if (!park) continue;

                // Fetch live data
                const endpoint = liveDataEndpointTemplate.replace('{{park_id}}', park.id);
                const response = await fetch(endpoint);
                const liveData = await response.json();

                // Create sanitized names for the file path
                const sanitizedDestination = parkInfo.destinationName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                const sanitizedPark = parkInfo.parkName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

                // Construct the file key
                const fileKey = `park-data/${sanitizedDestination}/${sanitizedPark}/${monthYear}/${timestamp.toISOString()}.json`;

                // Prepare the data to store
                const dataToStore = {
                    timestamp: timestamp.toISOString(),
                    destination: parkInfo.destinationName,
                    park: parkInfo.parkName,
                    parkId: park.id,
                    currentStatus: parkInfo.currentStatus,
                    data: liveData
                };

                // Store in S3
                if (saveToS3) {
                    await s3Client.send(new PutObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: fileKey,
                        Body: JSON.stringify(dataToStore, null, 2),
                        ContentType: 'application/json'
                    }));
                    console.log(`Successfully stored data for ${parkInfo.parkName} at ${fileKey}`);
                } else {
                    console.log('would save', dataToStore)
                }

            } else {
                console.log(`Skipping ${parkInfo.parkName} - currently closed`);
            }
        } catch (error) {
            console.error(`Error processing ${parkInfo.parkName}:`, error);
            // Continue with other parks even if one fails
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Park data collection completed',
            timestamp: timestamp.toISOString()
        })
    };
}

export const handler = async(event) => {
    try {
        // First get all park schedules to know which parks are open
        return init(true);
    } catch (error) {
        console.error('Error in lambda execution:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error processing park data',
                error: error.message
            })
        };
    }
};