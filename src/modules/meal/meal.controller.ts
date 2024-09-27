import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
    Headers,
    UseGuards,
    Request,
    UsePipes
} from '@nestjs/common';
import { MealService } from './meal.service';
import { CreateMealBodyDto, CreateMealCommentBody, CreateMealRatingBody, EditMealBodyDto } from './meal.dto';
import { AuthenticationGuard } from '../../guards/authentication.guard';
import { CreationGuard } from '../../guards/creation.guard';
import { EditionGuard } from '../../guards/edition.guard';
import { DeletionGuard } from '../../guards/deletion.guard';
import { DetailedMealWithTranslations, GetMealsQueryType } from './meal.types';
import { IngredientName, MealType } from '../../common/enums';
import { MealQueryValidationPipe } from '../../pipes/meal-query-validation.pipe';
import { TranslationService } from '../translation/translation.service';
import { Language, TransformedBody } from '../../common/types';
import { IngredientService } from '../ingredient/ingredient.service';

@Controller('meals')
export class MealController {
    constructor(private readonly mealService: MealService,
                private readonly translationService: TranslationService,
                private readonly ingredientService: IngredientService) {}

    @Get()
    @HttpCode(200)
    @UsePipes(MealQueryValidationPipe)
    public async getMeals(@Query() query: GetMealsQueryType) {
        const { ings, type } = query;
        const ingredients = ings.split(',');

        return await this.mealService.getMeals(<IngredientName[]>ingredients, <MealType>type);
    }

    @Get('/:id')
    @HttpCode(200)
    public async getMeal(@Param('id') id: string) {
        return await this.mealService.find(id);
    }

    @Get('/:id/details')
    @HttpCode(200)
    public async getMealDetails(@Param('id') id: string, @Headers('accept-language') lang: Language): Promise<DetailedMealWithTranslations> {
        const meal = await this.mealService.getMealDetails(id);
        const { description, ingredients, recipe } = await this.translationService.translateMeal(meal, lang);

        return { meal, description, ingredients, recipe };
    }

    @Post('/create')
    @HttpCode(201)
    @UseGuards(AuthenticationGuard)
    public async createMeal(@Body() body: CreateMealBodyDto) {
        const { data, authenticatedUser } = body;

        return await this.mealService.create(data, authenticatedUser);
    }

    @Delete('/:id')
    @HttpCode(204)
    @UseGuards(AuthenticationGuard)
    public async deleteMeal(@Param('id') id: string) {
        return await this.mealService.delete(id);
    }

    @Put('/:id')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard)
    public async updateMeal(@Param('id') id: string, @Body() body: EditMealBodyDto) {
        const { data } = body;
        const dataWithImages = this.ingredientService.applyWithImages(data);

        return await this.mealService.edit(id, dataWithImages);
    }

    @Post('/:id/create')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard, CreationGuard)
    public async confirmCreatingMeal(@Param('id') id: string, @Body() body) {
        const { authenticatedUser } = body;

        return await this.mealService.confirmCreating(id, authenticatedUser);
    }

    @Post('/:id/edit')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard, EditionGuard)
    public async confirmEditingMeal(@Param('id') id: string, @Body() body) {
        const { authenticatedUser } = body;

        return await this.mealService.confirmEditing(id, authenticatedUser);
    }

    @Post('/:id/delete')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard, DeletionGuard)
    public async confirmDeletingMeal(@Param('id') id: string, @Body() body) {
        const { authenticatedUser } = body;

        return await this.mealService.confirmDeleting(id, authenticatedUser);
    }

    @Get('/:id/comments')
    @HttpCode(200)
    public async getComments(@Param('id') id: string) {
        return await this.mealService.getComments(id);
    }

    @Post('/:id/comment')
    @HttpCode(201)
    @UseGuards(AuthenticationGuard)
    public async addMealComment(@Body() body: TransformedBody<CreateMealCommentBody>) {
        const { data, authenticatedUser } = body;

        return await this.mealService.addComment(data, authenticatedUser.login);
    }

    @Get('/:id/rating')
    @HttpCode(200)
    public async getRating(@Param('id') id: string) {
        return await this.mealService.calculateRating(id);
    }

    @Post('/:id/rating')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard)
    public async addRating(@Body() body: TransformedBody<CreateMealRatingBody>) {
        const { data, authenticatedUser } = body;

        return await this.mealService.addRating(data, authenticatedUser.login);
    }

    @Get('/proposal/all')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard)
    public async getMealProposal(@Request() req) {
        const { authenticatedUser } = req.body;

        return await this.mealService.getMealProposal(authenticatedUser);
    }

    @Post('/proposal')
    @HttpCode(204)
    @UseGuards(AuthenticationGuard)
    public async addMealProposal(@Request() req) {
        const { authenticatedUser, data } = req.body;
        const { ingredients } = data;

        return await this.mealService.addMealProposal(authenticatedUser, ingredients);
    }

    @Get('/soft/added')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard, CreationGuard)
    public async getSoftAddedMeals() {
        return await this.mealService.getMealsSoftAdded();
    }

    @Get('/soft/edited')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard, EditionGuard)
    public async getSoftEditedMeals() {
        return await this.mealService.getMealsSoftEdited();
    }

    @Get('/soft/deleted')
    @HttpCode(200)
    @UseGuards(AuthenticationGuard, DeletionGuard)
    public async getSoftDeletedMeals() {
        return await this.mealService.getMealsSoftDeleted();
    }
}
