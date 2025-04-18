-- Create the schema
CREATE SCHEMA IF NOT EXISTS parks;

-- Create the 'destination' table
CREATE TABLE IF NOT EXISTS parks.destination (
  id BIGSERIAL PRIMARY KEY,
  oid VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create the 'park' table
CREATE TABLE IF NOT EXISTS parks.park (
    id BIGSERIAL PRIMARY KEY,
    destination_id BIGINT NOT NULL,
    oid VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (destination_id) REFERENCES parks.destination(id)
);

-- Create the 'attraction_type' table
CREATE TABLE IF NOT EXISTS parks.attraction_type (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL,
    type_name VARCHAR(100) NOT NULL
);

-- Create the 'attraction' table
CREATE TABLE IF NOT EXISTS parks.attraction (
  id BIGSERIAL PRIMARY KEY,
  park_id BIGINT NOT NULL,
  attraction_type_id BIGINT NOT NULL,
  oid VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  long DOUBLE PRECISION NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (park_id) REFERENCES parks.park(id),
  FOREIGN KEY (attraction_type_id) REFERENCES parks.attraction_type(id)
);

-- Create the 'attraction_status' table
CREATE TABLE IF NOT EXISTS parks.attraction_status (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL,
  status VARCHAR(100) NOT NULL
);

-- Create the 'wait' table
CREATE TABLE IF NOT EXISTS parks.wait (
  id BIGSERIAL PRIMARY KEY,
  attraction_id BIGINT NOT NULL,
  attraction_status_id BIGINT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  last_updated TIMESTAMP NOT NULL,
  stand_by BIGINT NOT NULL,
  forecast JSONB,
  metadata JSONB,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (attraction_id) REFERENCES parks.attraction(id),
  FOREIGN KEY (attraction_status_id) REFERENCES parks.attraction_status(id)
);

CREATE TABLE IF NOT EXISTS parks.destination (
  id BIGSERIAL PRIMARY KEY,
  oid VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)