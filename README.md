# Video Transcoding Pipeline

A serverless video transcoding pipeline using AWS services. This system automatically processes videos uploaded to S3, transcodes them into multiple resolutions using FFmpeg, and stores the output in a production S3 bucket.

## Architecture

1. Video uploaded to S3 triggers an event to SQS
2. SQS Consumer (Node.js) polls for messages
3. ECS Fargate task spins up with the video details
4. FFmpeg transcodes video to 360p, 480p, and 720p
5. Transcoded videos uploaded to production S3 bucket

## Prerequisites

- Node.js 18+
- Docker
- AWS CLI configured
- AWS Account with the following services:
  - S3 (source and destination buckets)
  - SQS Queue
  - ECS Cluster (Fargate)
  - ECR Repository

## Project Structure

```
videoPipeliine/
├── src/
│   └── index.ts          # SQS consumer that triggers ECS tasks
├── container/
│   ├── index.js          # Video transcoding logic (runs in Docker)
│   ├── Dockerfile        # Docker image definition
│   └── package.json      # Container dependencies
├── .env                  # Environment variables (do not commit)
├── .env.example          # Environment variables template
├── package.json
└── tsconfig.json
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/your_account_id/your_queue_name
ECS_TASK_DEFINITION=arn:aws:ecs:us-east-1:your_account_id:task-definition/your_task_name
ECS_CLUSTER=arn:aws:ecs:us-east-1:your_account_id:cluster/your_cluster_name
ECS_SECURITY_GROUP=sg-xxxxxxxxx
ECS_SUBNETS=subnet-xxx,subnet-xxx,subnet-xxx
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build and Push Docker Image

#### Linux / macOS (Bash)

```bash
# Set AWS credentials
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_DEFAULT_REGION="us-east-1"

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account_id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
cd container
docker build -t video-transcoder .
docker tag video-transcoder:latest <account_id>.dkr.ecr.us-east-1.amazonaws.com/video-transcoder:latest
docker push <account_id>.dkr.ecr.us-east-1.amazonaws.com/video-transcoder:latest
```

#### Windows (PowerShell)

```powershell
# Set AWS credentials
$env:AWS_ACCESS_KEY_ID = "your_access_key"
$env:AWS_SECRET_ACCESS_KEY = "your_secret_key"
$env:AWS_DEFAULT_REGION = "us-east-1"

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account_id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
cd container
docker build -t video-transcoder .
docker tag video-transcoder:latest <account_id>.dkr.ecr.us-east-1.amazonaws.com/video-transcoder:latest
docker push <account_id>.dkr.ecr.us-east-1.amazonaws.com/video-transcoder:latest
```

### 3. Run the SQS Consumer

```bash
npm run dev
```

## Output Resolutions

The pipeline transcodes videos to the following resolutions:

| Resolution | Width | Height |
| ---------- | ----- | ------ |
| 360p       | 640   | 360    |
| 480p       | 854   | 480    |
| 720p       | 1280  | 720    |

## AWS ECS Task Configuration

- Launch Type: Fargate
- Operating System: Linux/X86_64
- Network Mode: awsvpc

## License

MIT
