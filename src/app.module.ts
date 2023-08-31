import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MealModule } from './modules/meal/meal.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getMongooseUri } from './utils';
import { IngredientModule } from './modules/ingredient/ingredient.module';
import { UserModule } from './modules/user/user.module';
import { AuthorizeMiddleware } from './middleware/authorize.middleware';

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: ['.env'],
        }),
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async () => ({
                uri: getMongooseUri(),
            }),
            inject: [ConfigService],
        }),
        IngredientModule,
        MealModule,
        UserModule
    ],
    controllers: [],
    providers: [],
})
export class AppModule implements NestModule {

    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(AuthorizeMiddleware)
            .forRoutes(
                { path: '/meals/create', method: RequestMethod.POST },
                { path: '/ingredients/create', method: RequestMethod.POST }
            );
    }
}
