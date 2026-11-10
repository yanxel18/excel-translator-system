const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } = require('@nestjs/graphql');
const { printSchema } = require('graphql');
const { ProductSurfacesResolver } = require('./dist/modules/product-surfaces/graphql.resolver');

async function generateSchema() {
  const app = await NestFactory.createApplicationContext(GraphQLSchemaBuilderModule, { logger: false });
  try {
    const factory = app.get(GraphQLSchemaFactory);
    const schema = await factory.create([ProductSurfacesResolver]);
    const output = join(__dirname, 'src/modules/product-surfaces/schema.gql');
    await mkdir(join(__dirname, 'src/modules/product-surfaces'), { recursive: true });
    await writeFile(output, `${printSchema(schema)}\n`);
    console.log(`GraphQL schema written to ${output}`);
  } finally {
    await app.close();
  }
}

generateSchema().catch((error) => { console.error(error); process.exitCode = 1; });
