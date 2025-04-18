import streamlit as st
import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import urllib.parse

# Load environment variables
load_dotenv()

# Database connection function
def get_db_connection():
    try:
        conn = psycopg2.connect(os.getenv('db_url'))
        return conn
    except Exception as e:
        st.error(f"Error connecting to database: {str(e)}")
        return None

# Initialize session state
if 'selected_park' not in st.session_state:
    st.session_state.selected_park = None
if 'selected_attractions' not in st.session_state:
    st.session_state.selected_attractions = []
if 'page' not in st.session_state:
    st.session_state.page = "Park Selection"

# Check for park in URL query parameters
query_params = st.query_params
if 'park' in query_params and query_params['park']:
    park_from_url = query_params['park']
    # If park is in URL and session state is different, update session state
    if park_from_url != st.session_state.selected_park:
        st.session_state.selected_park = park_from_url
        if 'page' in query_params and query_params['page']:
            st.session_state.page = query_params['page']
        else:
            # If park is set but page isn't, default to Attraction Selection
            st.session_state.page = "Attraction Selection"

# Check for attractions in URL query parameters
if 'attractions' in query_params and query_params['attractions']:
    try:
        # The attractions parameter could be a comma-separated string of IDs
        attractions_str = query_params['attractions']
        attraction_ids = [int(aid.strip()) for aid in attractions_str.split(',') if aid.strip()]
        if attraction_ids:
            st.session_state.selected_attractions = attraction_ids
    except Exception as e:
        st.warning(f"Error parsing attraction IDs from URL: {str(e)}")

# Update query parameters when page changes
def update_query_params():
    if st.session_state.selected_park:
        st.query_params['park'] = st.session_state.selected_park
    else:
        # Clear park parameter if it exists
        if 'park' in st.query_params:
            del st.query_params['park']
    
    if st.session_state.page:
        st.query_params['page'] = st.session_state.page
    else:
        # Clear page parameter if it exists
        if 'page' in st.query_params:
            del st.query_params['page']
            
    # Update attractions in URL
    if st.session_state.selected_attractions:
        attractions_str = ','.join(map(str, st.session_state.selected_attractions))
        st.query_params['attractions'] = attractions_str
    else:
        # Clear attractions parameter if it exists
        if 'attractions' in st.query_params:
            del st.query_params['attractions']

# Update URL parameters to match current state
update_query_params()

st.title("Wilck - Disneyland Planner")

# Display page based on session state
if st.session_state.page == "Park Selection":
    st.header("Select a Park")
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM parks.park")
                parks = cur.fetchall()
                park_names = [park['name'] for park in parks]
                
                selected_park = st.selectbox("Choose a park", park_names)
                if selected_park:
                    st.session_state.selected_park = selected_park
                    # Update URL immediately when park is selected
                    update_query_params()
                    
                if st.button("Continue to Attraction Selection"):
                    st.session_state.page = "Attraction Selection"
                    update_query_params()
                    st.experimental_rerun()
        except Exception as e:
            st.error(f"Error fetching parks: {str(e)}")
        finally:
            conn.close()

elif st.session_state.page == "Attraction Selection":
    st.header("Select Attractions")
    
    # Show the currently selected park
    st.info(f"Selected Park: {st.session_state.selected_park}")
    
    # Add a back button
    if st.button("← Back to Park Selection"):
        st.session_state.page = "Park Selection"
        update_query_params()
        st.experimental_rerun()
    
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # First get the attraction type IDs for restaurants and shows
                cur.execute("""
                    SELECT id FROM parks.attraction_type 
                    WHERE type_name IN ('Restaurant', 'Show')
                """)
                excluded_type_ids = [row['id'] for row in cur.fetchall()]
                
                # Then use these IDs to filter attractions
                cur.execute("""
                    SELECT a.id, a.name 
                    FROM parks.attraction a
                    JOIN parks.park p ON a.park_id = p.id
                    WHERE p.name = %s 
                    AND a.attraction_type_id NOT IN %s
                """, (st.session_state.selected_park, tuple(excluded_type_ids)))
                attractions = cur.fetchall()
                
                attraction_options = {attraction['id']: attraction['name'] for attraction in attractions}
                selected_attraction_ids = st.multiselect(
                    "Choose attractions (rides)",
                    options=list(attraction_options.keys()),
                    format_func=lambda x: attraction_options[x],
                    default=st.session_state.selected_attractions
                )
                
                if selected_attraction_ids:
                    if st.button("View Wait Times"):
                        st.session_state.selected_attractions = selected_attraction_ids
                        st.session_state.page = "Wait Times"
                        update_query_params()
                        st.experimental_rerun()
                    
        except Exception as e:
            st.error(f"Error fetching attractions: {str(e)}")
        finally:
            conn.close()

elif st.session_state.page == "Wait Times":
    st.header("Current Wait Times")
    
    # Show the currently selected park and number of attractions
    st.info(f"Selected Park: {st.session_state.selected_park} | Selected Attractions: {len(st.session_state.selected_attractions)}")
    
    # Add a back button
    if st.button("← Back to Attraction Selection"):
        st.session_state.page = "Attraction Selection"
        update_query_params()
        st.experimental_rerun()
    
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Get the most recent wait times for selected attractions
                cur.execute("""
                    WITH latest_times AS (
                        SELECT attraction_id, MAX(timestamp) as latest_time
                        FROM parks.wait
                        WHERE attraction_id = ANY(%s)
                        GROUP BY attraction_id
                    )
                    SELECT 
                        a.id as attraction_id,
                        a.name as "Attraction",
                        w.stand_by as "Wait Time (minutes)",
                        w.timestamp as "Last Updated",
                        s.status as "Status",
                        EXTRACT(DOW FROM w.timestamp) as day_of_week,
                        EXTRACT(HOUR FROM w.timestamp) as hour_of_day
                    FROM parks.wait w
                    JOIN parks.attraction a ON w.attraction_id = a.id
                    JOIN parks.attraction_status s ON w.attraction_status_id = s.id
                    JOIN latest_times lt ON w.attraction_id = lt.attraction_id AND w.timestamp = lt.latest_time
                    ORDER BY w.stand_by ASC NULLS LAST
                """, (st.session_state.selected_attractions,))
                
                current_wait_times = cur.fetchall()
                
                if current_wait_times:
                    # Get historical wait times for the past 60 days for time-based comparison
                    sixty_days_ago = datetime.now() - timedelta(days=60)
                    
                    # Create DataFrame for current wait times
                    current_df = pd.DataFrame(current_wait_times)
                    
                    # Add column only for time-based assessment
                    current_df["Time-Based Assessment"] = "N/A"
                    current_df["Avg Wait (Same Time)"] = None
                    
                    # For each attraction, get historical data and analyze
                    for i, row in current_df.iterrows():
                        attraction_id = row['attraction_id']
                        
                        # Skip the 5-day average calculation
                        
                        # Get time-specific historical data 
                        current_day_of_week = row['day_of_week']
                        current_hour = row['hour_of_day']
                        
                        # Get data from the same day of week and hour (±1 hour) over the last 60 days
                        cur.execute("""
                            SELECT 
                                w.stand_by, 
                                w.timestamp
                            FROM parks.wait w
                            JOIN parks.attraction_status s ON w.attraction_status_id = s.id
                            WHERE 
                                w.attraction_id = %s AND
                                w.timestamp > %s AND
                                s.status = 'Operating' AND
                                EXTRACT(DOW FROM w.timestamp) = %s AND
                                EXTRACT(HOUR FROM w.timestamp) BETWEEN %s AND %s
                        """, (attraction_id, sixty_days_ago, current_day_of_week, 
                             max(0, current_hour - 1), min(23, current_hour + 1)))
                        
                        time_specific_wait_times = cur.fetchall()
                        
                        if time_specific_wait_times:
                            # Calculate average wait time for same time of day and day of week
                            time_specific_waits = [hw['stand_by'] for hw in time_specific_wait_times if hw['stand_by'] is not None]
                            
                            if time_specific_waits:  # Make sure we have valid wait times
                                time_avg_wait = sum(time_specific_waits) / len(time_specific_waits)
                                current_df.at[i, "Avg Wait (Same Time)"] = round(time_avg_wait, 1)
                                
                                # Compare current wait with time-specific average
                                current_wait = row['Wait Time (minutes)']
                                if current_wait is not None:
                                    # Calculate percentage of average
                                    percentage = (current_wait / time_avg_wait) * 100
                                    current_df.at[i, "% of Average"] = round(percentage, 1)
                                    
                                    if current_wait <= time_avg_wait * 0.7:
                                        time_assessment = "Very Good"
                                    elif current_wait <= time_avg_wait * 0.9:
                                        time_assessment = "Good"
                                    elif current_wait <= time_avg_wait * 1.1:
                                        time_assessment = "Average"
                                    elif current_wait <= time_avg_wait * 1.3:
                                        time_assessment = "Busy"
                                    else:
                                        time_assessment = "Very Busy"
                                    
                                    current_df.at[i, "Time-Based Assessment"] = time_assessment
                    
                    # Add a column to sort by status (down attractions at the end)
                    current_df["Status_Order"] = current_df["Status"].apply(lambda x: 1 if x.lower() != "down" else 2)
                    
                    # Fill NaN values in "% of Average" with a high number for sorting purposes
                    if "% of Average" in current_df.columns:
                        current_df["% of Average"] = current_df["% of Average"].fillna(99999)
                    
                    # Sort the dataframe by Status_Order first (operating first), then by % of Average
                    current_df = current_df.sort_values(by=["Status_Order", "% of Average"], ascending=[True, True])
                    
                    # Convert day of week number to day name for better display
                    day_mapping = {0: 'Monday', 1: 'Tuesday', 2: 'Wednesday', 3: 'Thursday', 
                                4: 'Friday', 5: 'Saturday', 6: 'Sunday'}
                    
                    # Create a function to style the dataframe
                    def highlight_down(row):
                        if row["Status"].lower() == "down":
                            return ['background-color: #ffcccc' for _ in row]
                        return ['' for _ in row]
                    
                    # Display the enhanced DataFrame
                    display_columns = ["Attraction", "Wait Time (minutes)",
                                    "Avg Wait (Same Time)", "% of Average", "Time-Based Assessment",
                                    "Status", "Last Updated"]
                    st.dataframe(
                        current_df[display_columns].style.apply(highlight_down, axis=1),
                        hide_index=True
                    )
                    
                    # Display a simplified legend explaining the assessment categories
                    st.subheader("Wait Time Assessment Legend")
                    st.markdown("""
                    - **Very Good**: Current wait is at least 30% below the average
                    - **Good**: Current wait is 10-30% below the average
                    - **Average**: Current wait is within 10% of the average
                    - **Busy**: Current wait is 10-30% above the average
                    - **Very Busy**: Current wait is more than 30% above the average
                    
                    **Time-Based Assessment**: Compares to the average for the same day of week and similar time of day (±1 hour) over the past 60 days
                    """)
                    
                    # Add a button to start over
                    if st.button("Start Over"):
                        st.session_state.page = "Park Selection"
                        st.session_state.selected_park = None
                        st.session_state.selected_attractions = []
                        update_query_params()
                        st.experimental_rerun()
                else:
                    st.info("No wait times available for selected attractions")
                    
                    # Add a button to go back and select different attractions
                    if st.button("Select Different Attractions"):
                        st.session_state.page = "Attraction Selection"
                        update_query_params()
                        st.experimental_rerun()
        except Exception as e:
            st.error(f"Error fetching wait times: {str(e)}")
        finally:
            conn.close() 