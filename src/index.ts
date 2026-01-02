import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import type { S3Event } from 'aws-lambda';
import dotenv from 'dotenv';

dotenv.config();

const client = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function init() {
  const command = new ReceiveMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
  });

  while (true) {
    const { Messages } = await client.send(command);
    if (!Messages) {
      console.log('No messages in the queue');
      continue;
    }

    try {
      for (const message of Messages) {
        const { MessageId, Body } = message;
        console.log(`Message Received : ${MessageId}, ${Body}`);

        if (!Body) continue;

        // validate & parse the event

        const event = JSON.parse(Body) as S3Event;

        // Ignore test events
        if ('Service' in event && 'Event' in event) {
          if (event.Event === 'S3:TestEvent') {
            await client.send(
              new DeleteMessageCommand({
                QueueUrl: process.env.SQS_QUEUE_URL,
                ReceiptHandle: message.ReceiptHandle,
              })
            );
            continue;
          }
        }

        for (const record of event.Records) {
          const { s3 } = record;
          const {
            bucket,
            object: { key },
          } = s3;
          // Spin up the docker container to process the video

          const runTaskCommand = new RunTaskCommand({
            taskDefinition: process.env.ECS_TASK_DEFINITION,
            cluster: process.env.ECS_CLUSTER,
            launchType: 'FARGATE',
            networkConfiguration: {
              awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                securityGroups: [process.env.ECS_SECURITY_GROUP || ''],
                subnets: process.env.ECS_SUBNETS?.split(',') || [],
              },
            },
            overrides: {
              containerOverrides: [
                {
                  name: 'video-transcoder',
                  environment: [
                    { name: 'BUCKET_NAME', value: bucket.name },
                    { name: 'KEY', value: key },
                  ],
                },
              ],
            },
          });
          await ecsClient.send(runTaskCommand);
          // Delete the message from the queue after processing
          await client.send(
            new DeleteMessageCommand({
              QueueUrl: process.env.SQS_QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle,
            })
          );
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }
}

init();
