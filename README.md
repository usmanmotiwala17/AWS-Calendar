# Serverless Calendar Application (AWS)

## Project Description

This project is a fully serverless web application built using AWS services. It allows users to create, view, and delete calendar time blocks for specific dates.

The application uses a static frontend that communicates with a backend API built with Amazon API Gateway and AWS Lambda, with data stored in Amazon DynamoDB.

The goal of this project was to architect and deploy an end-to-end serverless system and understand how AWS services integrate in a production-style environment.

(I used AI to help me with creating the frontend and Lambda code)

Live Site: https://dev.dosfe0bw08nyp.amplifyapp.com/

<img width="1920" height="990" alt="chrome_aoVImgToQd" src="https://github.com/user-attachments/assets/599f703e-e0cc-434f-b567-0362132ee50b" />


---

## Architecture

The application follows this architecture:

Frontend (HTML, CSS, JavaScript)  
→ Amazon API Gateway (REST API)  
→ AWS Lambda (backend logic)  
→ Amazon DynamoDB (data storage)

All backend components are serverless and scale automatically.

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/617f638c-60a6-475c-bc1f-da066b5cb0e7" />


---

## Implementation Steps

### 1. Frontend Development

I created a static frontend using HTML, CSS, and JavaScript. The application includes:

- A calendar-style date selector  
- A form for creating time blocks  
- A list view for displaying saved blocks  
- Delete functionality for removing blocks  

The frontend sends HTTP POST requests to the API Gateway endpoint. 

---

### 2. DynamoDB Setup

I created a DynamoDB table named `CalendarBlocks`.

The table uses:
- `pk` (partition key)
- `sk` (sort key)

The partition key format:
USER#{userId}#DATE#{date}

The sort key format:
BLOCK#{startTime}#{blockId}

This structure allows efficient querying of all blocks for a specific user and date.

---

### 3. Lambda Function

I created a Lambda function using Python 3.11.

The Lambda function:
- Validates date and time input
- Prevents overlapping time blocks
- Saves blocks to DynamoDB
- Lists blocks for a selected date
- Deletes blocks

The handler is configured as:

lambda_function.lambda_handler

---

### 4. API Gateway

I created a REST API using Amazon API Gateway.

The following endpoints were configured:

POST /blocks  
POST /blocks/list  
POST /blocks/delete  

CORS was enabled to allow requests from the frontend.

After creating the routes, I deployed the API to the `dev` stage.

---

## Errors Encountered and Fixes

### Runtime.ImportModuleError

Error:
Unable to import module 'lambda_function'

Cause:
The Lambda file name did not match the handler configuration.

Fix:
Renamed the file to `lambda_function.py` so it matched:
lambda_function.lambda_handler

After renaming and redeploying, the error was resolved.

---

## Technologies Used

- Amazon API Gateway
- AWS Lambda
- Amazon DynamoDB
- HTML
- CSS
- JavaScript
- Git & GitHub
