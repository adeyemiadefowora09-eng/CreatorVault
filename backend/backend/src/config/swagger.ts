import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "CreatorVault API",
      version: "1.0.0",
      description: "Payment and deal management API for African creators",
    },
    servers: [
      {
        url: "/api/v1",
        description: "API v1",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/modules/**/*.routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
