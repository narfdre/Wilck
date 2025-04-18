import axios from 'axios';

// List of parks
const parks = [
    { id: "75ea578a-adc8-4116-a54d-dccb60765ef9", name: "Magic Kingdom Park" },
    { id: "47f90d2c-e191-4239-a466-5892ef59a88b", name: "EPCOT" },
    { id: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", name: "Disney's Hollywood Studios" },
    { id: "1c84a229-8862-4648-9c71-378ddd2c7693", name: "Disney's Animal Kingdom Theme Park" },
    { id: "b070cbc5-feaa-4b87-a8c1-f94cca037a18", name: "Disney's Typhoon Lagoon Water Park" },
    { id: "ead53ea5-22e5-4095-9a83-8c29300d7c63", name: "Disney's Blizzard Beach Water Park" },
    { id: "7340550b-c14d-4def-80bb-acdb51d49a66", name: "Disneyland Park" },
    { id: "832fcd51-ea19-4e77-85c7-75d5843b127c", name: "Disney California Adventure Park" }
];

// Base API endpoint
const endpointTemplate = "https://api.themeparks.wiki/v1/entity/{{park_id}}/live";

// Function to fetch live data
async function fetchLiveData() {
    try {
        const results = {};

        // Loop through each park and fetch data
        for (const park of parks) {
            const endpoint = endpointTemplate.replace('{{park_id}}', park.id)
            const response = await axios.get(endpoint);
            const liveData = response.data.liveData;

            // Filter by ATTRACTION and match parkId
            const attractions = liveData.filter(
                (item) => item.entityType === "ATTRACTION" && item.parkId === park.id
            );

            // Extract current standby wait times
            results[park.name] = attractions.map((attraction) => (attraction));
        }

        return results;
    } catch (error) {
        console.error("Error fetching live data:", error.message);
        return null;
    }
}

// Example usage
fetchLiveData().then((data) => {
    console.log("Live Wait Times by Park:");
    console.log(JSON.stringify(data, null, 2));
});