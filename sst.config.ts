/// <reference path="./.sst/platform/config.d.ts" />

import { statfsSync } from "fs";

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
    const api = new sst.aws.ApiGatewayV2("api");
    const bucket = new sst.aws.Bucket("MyBucket");

    api.route("GET /", {
      link: [bucket],
      handler: "index.upload",
    });
    api.route("GET /latest", {
      link: [bucket],
      handler: "index.latest",
    });
  },
});
