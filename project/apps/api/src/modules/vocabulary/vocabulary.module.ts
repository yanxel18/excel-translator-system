import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';

@Module({ imports: [AuthenticationModule], controllers: [VocabularyController], providers: [VocabularyService] })
export class VocabularyModule {}
