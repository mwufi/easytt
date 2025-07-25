/// <reference path="./.sst/platform/config.d.ts" />


export default $config({
  app(input) {
    return {
      name: "my-ts-app",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    // Deploy the torrent downloader service
     // Create a VPC
     const vpc = new sst.aws.Vpc("MyVpc");

     // Create an ECS cluster
     const cluster = new sst.aws.Cluster("MyCluster", { vpc });
 
     // Create an S3 bucket
     const bucket = new sst.aws.Bucket("TorrentDataBucket");
 
     // Create a Fargate service with HTTP-only load balancer for API endpoints
     const service = new sst.aws.Service("TorrentDownloadService", {
       cluster,
       image: {
         context: "./service",
         dockerfile: "Dockerfile"
       },
       cpu: "1 vCPU",
       memory: "4 GB",
       storage: "100 GB", // Ephemeral storage for torrents
       environment: {
         S3_BUCKET: bucket.name,
       },
       link: [bucket],
       loadBalancer: {
         domain: "torrent.mailpuppy.org",
         ports: [
           { listen: "80/http", redirect: "443/https" },
           { listen: "443/https", forward: "3000/http" }
         ]
       },
       dev: {
         command: "echo 'Local dev not supported for Fargate; deploy to run'",
       },
     });

    // Keep existing API routes if needed
    const api = new sst.aws.ApiGatewayV2("api");
    const bucket2 = new sst.aws.Bucket("MyBucket");

    api.route("GET /", {
      link: [bucket2],
      handler: "index.upload",
    });
    api.route("GET /latest", {
      link: [bucket2],
      handler: "index.latest",
    });

    return {
      service: service.url,
      bucket: bucket.name,
      bucket2: bucket2.name,
    }
  },
});
