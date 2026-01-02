import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import oldfs from 'node:fs';
import fs from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';

const RESOLUTIONS = [
  { name: '360p', width: 640, height: 360 },
  { name: '480p', width: 854, height: 480 },
  { name: '720p', width: 1280, height: 720 },
];

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

//Env
const BUCKET = process.env.BUCKET_NAME || '';
const KEY = process.env.KEY || '';

async function init() {
  // Download the original video from s3
  const videoId = Date.now().toString();
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
  });

  const result = await s3Client.send(command);
  const originalFilePath = `original-video.mp4`;
  // await fs.writeFile(originalilePath, result.Body); // path, file

  await pipeline(result.Body, oldfs.createWriteStream(originalFilePath));

  const orginalVideoPath = path.resolve('original-video.mp4');

  // start the Transcode the video using ffmpeg

  const promises = RESOLUTIONS.map((resolution) => {
    const outputPath = `vid-${videoId}-${resolution.name}.mp4`;

    return new Promise((resolve, reject) => {
      ffmpeg(orginalVideoPath)
        .output(outputPath)
        .withVideoCodec('libx264')
        .withAudioCodec('aac')
        .size(`${resolution.width}x${resolution.height}`)
        .format('mp4')
        .on('end', async () => {
          console.log(`Transcoding to ${resolution.name} completed.`);

          // Upload the transcoded video back to s3
          const putCommand = new PutObjectCommand({
            Bucket: 'production.pankajk.tech',
            Key: outputPath,
            Body: oldfs.createReadStream(outputPath),
            ContentType: 'video/mp4',
          });

          try {
            await s3Client.send(putCommand);
            console.log(`Uploaded ${outputPath}`);
            resolve(outputPath);
          } catch (err) {
            reject(err);
          }
        })
        .on('error', reject)
        .run();
    });
  });
  const videoFiles = await Promise.all(promises);
  console.log('All videos transcoded and uploaded:', videoFiles);

  console.log('Cleaning up temporary files...');
  try {
    await fs.unlink(originalFilePath);
    console.log(`Deleted ${originalFilePath}`);

    for (const file of videoFiles) {
      await fs.unlink(file);
      console.log(`Deleted ${file}`);
    }
    console.log('Cleanup completed.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}

init().finally(() => process.exit(0));
