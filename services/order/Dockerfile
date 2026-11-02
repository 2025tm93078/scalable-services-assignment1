# Use the official Node.js 18 alpine image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to leverage Docker caching
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the source code and OpenAPI documentation
COPY src/ ./src/

# The Order service runs on port 3002
EXPOSE 3002

# Command to start the application
CMD ["npm", "start"]