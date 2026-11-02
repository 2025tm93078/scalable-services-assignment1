# Use the official Node.js 18 alpine image for a smaller footprint
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY src/ ./src/
COPY docs/ ./docs/

# The port your service runs on
EXPOSE 3006

# Command to start the application
CMD ["npm", "start"]