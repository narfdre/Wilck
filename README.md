# Wilck - Disneyland Park Planner

A Streamlit application for planning your Disneyland visit by tracking ride wait times.

## Setup

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

2. Ensure your `.env` file contains the correct database connection string:
```
db_url='your_postgresql_connection_string'
```

3. Make sure the database schema is set up according to `initial_schema.sql`

## Running the App

To run the Streamlit app:
```bash
streamlit run app.py
```

## Features

- Park Selection: Choose from available Disney parks
- Attraction Selection: Select rides you want to visit
- Wait Times: View current wait times for selected attractions, ordered from shortest to longest

## Database Schema

The app uses the following tables:
- `parks.park`: List of available parks
- `attractions.attraction`: Attraction information
- `wait_times.wait_time`: Current wait times for attractions
- `user_selected_attractions`: User's selected attractions 