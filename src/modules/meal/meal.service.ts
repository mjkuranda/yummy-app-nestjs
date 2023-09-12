import { Model, isValidObjectId } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { MealDocument } from './meal.interface';
import { InjectModel } from '@nestjs/mongoose';
import { models } from '../../constants/models.constant';
import { CreateMealDto } from './meal.dto';
import { BadRequestException } from '../../exceptions/bad-request.exception';
import { NotFoundException } from '../../exceptions/not-found.exception';
import { LoggerService } from '../logger/logger.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MealService {

    constructor(
        @InjectModel(models.MEAL_MODEL)
        private mealModel: Model<MealDocument>,
        private redisService: RedisService,
        private loggerService: LoggerService
    ) {}

    async create(createMealDto: CreateMealDto): Promise<MealDocument> {
        const createdMeal = await this.mealModel.create(createMealDto) as MealDocument;

        const title = createMealDto.title;
        const ingredientCount = createMealDto.ingredients.length;
        const imageUrlDescription = createMealDto
            ? `"${createMealDto.imageUrl}" image url`
            : 'no image';
        const context = 'MealService/create';
        const message = `New meal "${title}", having ${ingredientCount} ingredients and with ${imageUrlDescription}.`;

        this.loggerService.info(context, message);

        await this.redisService.set<MealDocument>(createdMeal, 'meal');
        this.loggerService.info(context, `Cached a new meal with ${createdMeal._id} id.`);

        return createdMeal;
    }

    async find(id: string): Promise<MealDocument> {
        const context = 'MealService/find';

        if (!isValidObjectId(id)) {
            const message = `Provided "${id}" that is not a correct MongoDB id.`;
            this.loggerService.error(context, message);

            throw new BadRequestException(context, message);
        }

        const key = this.redisService.encodeKey({ _id: id }, 'meal');
        const cachedMeal = await this.redisService.get<MealDocument>(key) as MealDocument;

        if (cachedMeal) {
            this.loggerService.info(context, `Fetched a meal with "${cachedMeal._id}" id from cache.`);

            return cachedMeal;
        }

        const meal = await this.mealModel.findById(id) as MealDocument;

        if (!meal) {
            const message = `Cannot find a meal with "${id}" id.`;
            this.loggerService.error(context, message);

            throw new NotFoundException(context, message);
        }

        this.loggerService.info(context, `Found meal with "${id}" id.`);

        await this.redisService.set<MealDocument>(meal, 'meal');
        this.loggerService.info(context, `Cached a meal with "${meal._id}" id.`);

        return meal;
    }

    async findAll(): Promise<MealDocument[]> {
        const meals = (await this.mealModel.find()) as MealDocument[];
        const message = `Found ${meals.length} meals.`;

        this.loggerService.info('MealService/findAll', message);

        return meals;
    }
}
