// import { JSDOM } from 'jsdom';
// import fetch from 'node-fetch';

// async function fetchAndParsePlotlyData(url) {
//     try {
//         const response = await fetch(url);
//         if (!response.ok) {
//             throw new Error(`HTTP error! Status: ${response.status}`);
//         }
//         const jsonResponse = await response.json();
//         const htmlString = jsonResponse.plot1;

//         // Use JSDOM instead of DOMParser
//         const dom = new JSDOM(htmlString);
//         const doc = dom.window.document;

//         // Find the script tag containing the Plotly data
//         const scripts = Array.from(doc.querySelectorAll('script'));
//         const scriptTag = scripts.find(script => script.textContent.includes('Plotly.newPlot'));
//         if (!scriptTag) {
//             throw new Error("Script tag with Plotly data not found.");
//         }

//         // Extract the JSON string from the script content
//         const scriptContent = scriptTag.textContent;
//         console.log(scriptContent.toString());
//         // Use a regex to extract the Plotly data from the script
//         const plotlyDataMatch = scriptContent.match(/Plotly\.newPlot\s*\(\s*["'].*?["']\s*,\s*(\[[\s\S]*?\])\s*,/);

//         if (!plotlyDataMatch) {
//             throw new Error("Plotly data not found in the script content.");
//         }

// Parse the Plotly data
// const plotlyData = JSON.parse(plotlyDataMatch[1]);
// const heatmapData = plotlyData[0]; // Assuming the first dataset is the heatmap

// // Extract the x, y, and z arrays
// const xValues = heatmapData.x; // Times
// const yValues = heatmapData.y; // Dates
// const zValues = heatmapData.z; // Data points

// if (!xValues || !yValues || !zValues) {
//     throw new Error("Missing x, y, or z data in Plotly heatmap.");
// }

// // Combine the data into an array of objects
// const parsedData = [];
// yValues.forEach((date, rowIndex) => {
//     xValues.forEach((time, colIndex) => {
//         const value = zValues[rowIndex][colIndex];
//         if (value !== "") { // Exclude empty values
//             parsedData.push({ date, time, value });
//         }
//     });
// });

// return parsedData;
//     } catch (error) {
//         console.error('Error fetching or parsing data:', error);
//     }
// }

// // Example usage
// const url = 'https://www.thrill-data.com/waits/graph/quick/rideheat?id=509&dateStart=2024-12-09&tag=hour&boarding=False';
// fetchAndParsePlotlyData(url).then(dataPoints => {
//     console.log(dataPoints);
// });

import { JSDOM } from 'jsdom';
import axios from 'axios';

async function extractAndExecutePlotlyData(url) {
    try {
        // Fetch the HTML content
        const response = await axios.get(url);
        const htmlContent = response.data.plot1;

        // Create a JSDOM environment
        const dom = new JSDOM(htmlContent, { runScripts: "outside-only" });

        // Simulate the global window, document, and Plotly objects
        const window = dom.window;
        const document = window.document;

        // Mock the Plotly object in the JSDOM environment
        window.Plotly = {
            newPlot: function(...args) {
                // Capture the arguments passed to newPlot
                window.capturedData.push(args);
            },
        };

        // Create an array to store captured Plotly data
        window.capturedData = [];

        // Extract <script> tags from the document
        const scriptTags = Array.from(document.querySelectorAll("script"));

        // Filter for scripts containing `Plotly.newPlot`
        const plotlyScripts = scriptTags
            .map((tag) => tag.textContent)
            .filter((content) => content && content.includes("Plotly.newPlot"));

        if (plotlyScripts.length === 0) {
            throw new Error("No Plotly script found in the HTML.");
        }

        // Execute the extracted scripts in the JSDOM environment
        plotlyScripts.forEach((script) => {
            window.eval(script);
        });

        // Return the captured Plotly data
        return window.capturedData.map(([graphDiv, data, layout, config]) => ({
            graphDiv,
            data,
            layout,
            config,
        }));
    } catch (error) {
        console.error("Error processing Plotly data:", error);
        return [];
    }
}

// Example usage
const url = "https://www.thrill-data.com/waits/graph/quick/rideheat?id=509&dateStart=2024-11-09&tag=five&boarding=False";

extractAndExecutePlotlyData(url).then((plotlyData) => {
    const extractedData = [];

    plotlyData.forEach((plot) => {
        const { data } = plot;

        // Assume the first dataset contains the x, y, and z arrays
        const heatmapData = data[0];
        const xValues = heatmapData.x; // Time
        const yValues = heatmapData.y; // Date
        const zValues = heatmapData.z; // Data points

        // Combine the x, y, and z arrays into an array of objects
        yValues.forEach((date, rowIndex) => {
            xValues.forEach((time, colIndex) => {
                const value = zValues[rowIndex][colIndex];
                if (value !== "") { // Exclude empty values
                    extractedData.push({ date, time, value });
                }
            });
        });
    });
    console.log("Captured Plotly Data:", extractedData);
});