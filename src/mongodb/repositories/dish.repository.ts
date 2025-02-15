import { AbstractRepository } from './abstract.repository';
import { DishDocument } from '../documents/dish.document';
import { InjectModel } from '@nestjs/mongoose';
import { models } from '../../constants/models.constant';
import { Model } from 'mongoose';
import { CreateDishWithAuthorDto } from '../../modules/dish/dish.dto';
import { DishIngredient } from '../../modules/ingredient/ingredient.types';
import { RatedDish } from '../../modules/dish/dish.types';
import { calculateMissing, calculateRelevance } from '../../common/helpers';

export class DishRepository extends AbstractRepository<DishDocument, CreateDishWithAuthorDto<DishIngredient> | { softAdded: boolean }> {

    constructor(@InjectModel(models.DISH_MODEL) model: Model<DishDocument>) {
        super(model);
    }

    async delete(id: string): Promise<void> {
        await this.model.deleteOne({ _id: id });
    }

    async getDishes(providedIngredients: string[]): Promise<RatedDish[]> {
        const dishes = await this.findAll({
            'ingredients.name': { $in: providedIngredients },
            $or: [
                { softAdded: { $exists: false }},
                { softAdded: false }
            ]
        });

        return dishes.map(dish => {
            const { id, title, imageUrl, type, mealType, ingredients, language } = dish;
            const mealIngredients = ingredients.map(ingredient => ingredient.name);
            const relevance = calculateRelevance(providedIngredients, mealIngredients);
            const missingCount = calculateMissing(providedIngredients, mealIngredients);

            return { id, title, imgUrl: imageUrl, type, mealType, ingredients: mealIngredients, language, provider: 'yummy', relevance, missingCount };
        });
    }
}