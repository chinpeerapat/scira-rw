import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { serverEnv } from '@/env/server';
import { NextRequest, NextResponse } from 'next/server';

// Initialize S3 client
const s3Client = new S3Client({
    region: "auto",  // adjust based on your needs
    endpoint: serverEnv.S3_ENDPOINT,
    credentials: {
        accessKeyId: serverEnv.S3_ACCESS_KEY,
        secretAccessKey: serverEnv.S3_SECRET_KEY,
    },
});

export const runtime = 'edge';

export async function GET(req: NextRequest) {
    if (req.headers.get('Authorization') !== `Bearer ${serverEnv.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        await deleteAllObjectsInFolder('mplx/');
        return new NextResponse('All images in mplx/ folder were deleted', {
            status: 200,
        });
    } catch (error) {
        console.error('An error occurred:', error);
        return new NextResponse('An error occurred while deleting images', {
            status: 500,
        });
    }
}

async function deleteAllObjectsInFolder(prefix: string) {
    let continuationToken: string | undefined;

    do {
        // List objects in the bucket with the given prefix
        const listCommand = new ListObjectsV2Command({
            Bucket: serverEnv.S3_BUCKET,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
        });

        const listResponse = await s3Client.send(listCommand);
        
        if (listResponse.Contents && listResponse.Contents.length > 0) {
            // Prepare objects for deletion
            const objectsToDelete = listResponse.Contents.map(object => ({
                Key: object.Key!
            }));

            // Delete objects in batch
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: serverEnv.S3_BUCKET,
                Delete: {
                    Objects: objectsToDelete,
                    Quiet: true
                }
            });

            await s3Client.send(deleteCommand);
            console.log(`Deleted ${objectsToDelete.length} objects`);
        }

        continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    console.log('All objects in the specified folder were deleted');
}
