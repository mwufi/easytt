/// <reference path="../.sst/platform/config.d.ts" />

export function buildTorrentDownloader() {
    

    // Output the bucket name, service ARN, and URL
    return {
        BucketName: bucket.name,
        ServiceUrl: service.url,
    };
}