import { UserSchema } from '../mongodb/schemas/user.schema';
import { UserActionSchema } from '../mongodb/schemas/user-action.schema';
import { MealSchema } from '../mongodb/schemas/meal.schema';
import { SearchQuerySchema } from '../mongodb/schemas/search-query.schema';
import { MealCommentSchema } from '../mongodb/schemas/meal-comment.schema';
import { MealRatingSchema } from '../mongodb/schemas/meal-rating.schema';

export const models = {
    MEAL_MODEL: 'MEAL_MODEL',
    MEAL_COMMENT_MODEL: 'MEAL_COMMENT_MODEL',
    MEAL_RATING_MODEL: 'MEAL_RATING_MODEL',
    SEARCH_QUERY_MODEL: 'SEARCH_QUERY_MODEL',
    USER_MODEL: 'USER_MODEL',
    USER_ACTION_MODEL: 'USER_ACTION_MODEL'
};

export const USER_MODEL = { name: models.USER_MODEL, schema: UserSchema };
export const SEARCH_QUERY_MODEL = { name: models.SEARCH_QUERY_MODEL, schema: SearchQuerySchema };
export const USER_ACTION_MODEL = { name: models.USER_ACTION_MODEL, schema: UserActionSchema };
export const MEAL_MODEL = { name: models.MEAL_MODEL, schema: MealSchema };
export const MEAL_COMMENT_MODEL = { name: models.MEAL_COMMENT_MODEL, schema: MealCommentSchema };
export const MEAL_RATING_MODEL = { name: models.MEAL_RATING_MODEL, schema: MealRatingSchema };