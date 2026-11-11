import { Module } from '@nestjs/common';
import { FileUploadModule } from './modules/file-upload/file-upload.module';
import { TextExtractionModule } from './modules/text-extraction/text-extraction.module';
import { TranslationModule } from './modules/translation/translation.module';
import { JobManagementModule } from './modules/job-management/job-management.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { ProgressTrackingModule } from './modules/progress-tracking/progress-tracking.module';
import { PersistenceModule } from './modules/persistence/persistence.module';
import { VocabularyModule } from './modules/vocabulary/vocabulary.module';
import { GraphQLSchemaBuilderModule } from '@nestjs/graphql';
import { ProductSurfacesModule } from './modules/product-surfaces/product-surfaces.module';

@Module({
  imports: [
    PersistenceModule,
    FileUploadModule,
    TextExtractionModule,
    TranslationModule,
    ProductSurfacesModule,
    JobManagementModule,
    AuthenticationModule,
    ProgressTrackingModule,
    VocabularyModule,
    GraphQLSchemaBuilderModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
