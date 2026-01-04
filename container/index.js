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

const BUCKET = process.env.BUCKET_NAME || '';
const KEY = process.env.KEY || '';

async function uploadDirectoryToS3(localDir, s3Prefix) {
  const files = await fs.readdir(localDir);

  for (const file of files) {
    const filePath = `${localDir}/${file}`;
    const s3Key = `${s3Prefix}/${file}`;

    const contentType = file.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : 'video/mp2t';

    await s3Client.send(
      new PutObjectCommand({
        Bucket: 'production.pankajk.tech',
        Key: s3Key,
        Body: oldfs.createReadStream(filePath),
        ContentType: contentType,
      })
    );
    console.log(`Uploaded ${s3Key}`);
  }
}

async function init() {
  // Download the original video from s3
  const videoId = Date.now().toString();
  const hlsFolder = `hls-${videoId}`;
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
  });

  const result = await s3Client.send(command);
  const originalFilePath = `vid-${videoId}.mp4`;
  await pipeline(result.Body, oldfs.createWriteStream(originalFilePath));
  const orginalVideoPath = path.resolve(originalFilePath);

  // create hls folder for each resolution and with the videoId
  for (const resolution of RESOLUTIONS) {
    await fs.mkdir(`${hlsFolder}/${resolution.name}`, { recursive: true });
  }

  // start the Transcode the video using ffmpeg
  const promises = RESOLUTIONS.map((resolution) => {
    // Folder for this resolution: hls-1704389123456/360p
    const outputDir = `${hlsFolder}/${resolution.name}`;

    // Playlist file: hls-1704389123456/360p/playlist.m3u8
    const outputPath = `${outputDir}/playlist.m3u8`;

    // Segment files: hls-1704389123456/360p/segment_000.ts, segment_001.ts, etc.
    const segmentPath = `${outputDir}/segment_%03d.ts`;

    return new Promise((resolve, reject) => {
      ffmpeg(orginalVideoPath)
        .output(outputPath)
        .withVideoCodec('libx264')
        .withAudioCodec('aac')
        .size(`${resolution.width}x${resolution.height}`)
        .outputOptions([
          '-hls_time 10',
          '-hls_list_size 0',
          `-hls_segment_filename ${segmentPath}`,
        ])
        .on('end', async () => {
          console.log(`Transcoding to ${resolution.name} completed.`);

          // Upload ALL files in the resolution folder to S3
          try {
            await uploadDirectoryToS3(outputDir, `${videoId}/${resolution.name}`);
            resolve(resolution.name);
          } catch (err) {
            reject(err);
          }
        })
        .on('error', reject)
        .run();
    });
  });

  await Promise.all(promises);
  console.log('All resolutions transcoded and uploaded!');

  // Create and upload master playlist
  const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720p/playlist.m3u8
`;

  const masterPath = `${hlsFolder}/master.m3u8`;
  await fs.writeFile(masterPath, masterPlaylist);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: 'production.pankajk.tech',
      Key: `${videoId}/master.m3u8`,
      Body: oldfs.createReadStream(masterPath),
      ContentType: 'application/vnd.apple.mpegurl',
    })
  );
  console.log('Uploaded master.m3u8');

  // Cleanup
  console.log('Cleaning up temporary files...');
  try {
    await fs.unlink(originalFilePath);
    console.log(`Deleted ${originalFilePath}`);

    await fs.rm(hlsFolder, { recursive: true, force: true });
    console.log(`Deleted ${hlsFolder}`);

    console.log('Cleanup completed.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}

init().finally(() => process.exit(0));
