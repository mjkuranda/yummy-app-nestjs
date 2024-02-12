import { INestApplication } from '@nestjs/common';
import { AuthService } from '../src/modules/auth/auth.service';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { LoggerService } from '../src/modules/logger/logger.service';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { MealService } from '../src/modules/meal/meal.service';
import { JwtManagerService } from '../src/modules/jwt-manager/jwt-manager.service';
import { RedisService } from '../src/modules/redis/redis.service';
import { MealRepository } from '../src/mongodb/repositories/meal.repository';
import { SpoonacularApiService } from '../src/modules/api/spoonacular/spoonacular.api.service';
import { RatedMeal } from '../src/modules/meal/meal.types';

describe('UserController (e2e)', () => {
    let app: INestApplication;
    let authService: AuthService;
    let mealService: MealService;
    let mealRepository: MealRepository;
    let jwtManagerService: JwtManagerService;
    let redisService: RedisService;
    let spoonacularApiService: SpoonacularApiService;

    const getCookie = (res, cookieName) => {
        const cookies = {};
        res.headers['set-cookie'][0]
            .split('; ')
            .forEach(cookie => {
                const [key, value] = cookie.split('=');

                cookies[key] = value;
            });

        return cookies[cookieName] !== ''
            ? cookies[cookieName]
            : undefined;
    };
    const loggerServiceProvider = {
        info: () => {},
        error: () => {}
    };
    const mockMealRepositoryProvider = {
        create: () => {},
        updateOne: () => {},
        findAll: () => {},
        findOne: () => {},
        findById: () => {}
    };
    const redisServiceProvider = {
        set: jest.fn(),
        get: jest.fn(),
        del: jest.fn(),
        encodeKey: jest.fn()
    };
    const jwtManagerServiceProvider = {
        generateAccessToken: jest.fn(),
        verifyAccessToken: jest.fn()
    };
    const spoonacularApiServiceProvider = {};

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(LoggerService).useValue(loggerServiceProvider)
            .overrideProvider(MealRepository).useValue(mockMealRepositoryProvider)
            .overrideProvider(RedisService).useValue(redisServiceProvider)
            .overrideProvider(JwtManagerService).useValue(jwtManagerServiceProvider)
            .overrideProvider(SpoonacularApiService).useValue(spoonacularApiServiceProvider)
            .compile();

        app = moduleRef.createNestApplication();
        app.use(cookieParser());
        await app.init();

        authService = moduleRef.get(AuthService);
        mealService = moduleRef.get(MealService);
        mealRepository = moduleRef.get(MealRepository);
        jwtManagerService = moduleRef.get(JwtManagerService);
        redisService = moduleRef.get(RedisService);
        spoonacularApiService = moduleRef.get(SpoonacularApiService);
    });

    describe('/meals (GET)', () => {
        it('should get all matching meals', () => {
            const mealResult: RatedMeal[] = [];

            jest.spyOn(mealService, 'getMeals').mockImplementation(jest.fn());
            jest.spyOn(mealService, 'getMeals').mockResolvedValue(mealResult);

            return request(app.getHttpServer())
                .get('/meals?ings=carrot,tomato&type=soup')
                .expect(200)
                .expect(mealResult);
        });
    });

    describe('/meals/:id (GET)', () => {
        it('should find a meal with specific id', () => {
            const mockParamId = '635981f6e40f61599e839ddb';
            const mockMeal = {
                _id: '635981f6e40f61599e839ddb',
                title: 'Y',
                description: 'Lorem ipsum',
                author: 'Author name 2',
                ingredients: [],
                posted: 123456,
                type: 'some type'
            } as any;

            jest.spyOn(mealRepository, 'findOne').mockReturnValueOnce(mockMeal);

            return request(app.getHttpServer())
                .get(`/meals/${mockParamId}`)
                .expect(200)
                .expect(mockMeal);
        });

        it('should not find a meal', () => {
            const mockParamId = '635981f6e40f61599e839ddb';
            const mockMeal = null;

            jest.spyOn(mealRepository, 'findOne').mockReturnValueOnce(mockMeal);

            return request(app.getHttpServer())
                .get(`/meals/${mockParamId}`)
                .expect(404);
        });
    });

    describe('/meals/create (POST)', () => {
        it('should add a new meal when user is logged-in', () => {
            const mockRequestBody = {
                title: 'Title',
                description: 'Lorem ipsum',
                ingredients: ['123', '456'],
                type: 'some type'
            } as any;
            const mockUser = {
                _id: '635981f6e40f61599e839ddb',
                login: 'user',
                password: 'hashed'
            } as any;
            const accessToken = 'token';

            jest.spyOn(authService, 'getAuthorizedUser').mockReturnValueOnce(mockUser);
            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue(accessToken);

            return request(app.getHttpServer())
                .post('/meals/create')
                .set('Cookie', ['accessToken=token'])
                .set('Accept', 'application/json')
                .set('Authorization', 'Bearer token')
                .send(mockRequestBody)
                .expect(201);
        });

        it('should throw an error, when user is not logged-in', () => {
            const mockRequestBody = {
                title: 'Title',
                description: 'Lorem ipsum',
                ingredients: ['123', '456'],
                type: 'some type'
            } as any;

            return request(app.getHttpServer())
                .post('/meals/create')
                .set('Cookie', [])
                .set('Accept', 'application/json')
                .send(mockRequestBody)
                .expect(401);
        });
    });

    describe('/meals/:id (PUT)', () => {
        it('should introduce edition when user is logged-in', () => {
            const mockRequestBody = {
                description: 'New lorem ipsum'
            } as any;
            const mockEditedMeal = {
                description: mockRequestBody.description,
                title: 'Abc',
                ingredients: ['xxx'],
                type: 'Some type'
            } as any;
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed'
            } as any;
            const accessToken = 'token';

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue(accessToken);
            jest.spyOn(mealService, 'edit').mockReturnValueOnce(mockEditedMeal);

            return request(app.getHttpServer())
                .put('/meals/635981f6e40f61599e839ddf')
                .set('Cookie', ['accessToken=token'])
                .set('Accept', 'application/json')
                .set('Authorization', 'Bearer token')
                .send(mockRequestBody)
                .expect(200)
                .expect(mockEditedMeal);
        });

        it('should throw an error, when user is not logged-in', () => {
            const mockRequestBody = {
                description: 'New lorem ipsum',
            } as any;

            return request(app.getHttpServer())
                .put('/meals/635981f6e40f61599e839ddf')
                .set('Cookie', [])
                .set('Accept', 'application/json')
                .send(mockRequestBody)
                .expect(401)
                .expect(res => {
                    expect(res.body.message).toBe('Not provided accessToken.');
                });
        });
    });

    describe('/meals/:id (DELETE)', () => {
        it('should mark as soft-deleted when user is logged-in', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed'
            } as any;
            const mockDeletedMeal = {} as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');
            jest.spyOn(mealService, 'delete').mockReturnValueOnce(mockDeletedMeal);

            return request(app.getHttpServer())
                .delete('/meals/635981f6e40f61599e839ddf')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(204);
        });

        it('should throw an error, when user is not logged-in', () => {
            return request(app.getHttpServer())
                .delete('/meals/635981f6e40f61599e839ddf')
                .set('Cookie', [])
                .expect(401)
                .expect(res => {
                    expect(res.body.message).toBe('Not provided accessToken.');
                });
        });
    });

    describe('/meals/:id/create (POST)', () => {
        it('should confirm adding a new meal when user is an admin', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed',
                isAdmin: true
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');
            jest.spyOn(mealService, 'confirmCreating').mockReturnValueOnce({} as any);

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/create')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(200);
        });

        it('should confirm adding a new meal when user has canAdd capability', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed',
                capabilities: {
                    canAdd: true
                }
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');
            jest.spyOn(mealService, 'confirmCreating').mockReturnValueOnce({} as any);

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/create')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(200);
        });

        it('should fail when user has not sufficient capabilities', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed'
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/create')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(403);
        });

        it('should fail when you are not logged-in', () => {
            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/create')
                .set('Cookie', [])
                .expect(401);
        });
    });

    describe('/meals/:id/edit (POST)', () => {
        it('should confirm editing a meal when user is an admin', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed',
                isAdmin: true
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');
            jest.spyOn(mealService, 'confirmEditing').mockReturnValueOnce({} as any);

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/edit')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(200);
        });

        it('should confirm editing a meal when user has canEdit capability', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed',
                capabilities: {
                    canEdit: true
                }
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');
            jest.spyOn(mealService, 'confirmEditing').mockReturnValueOnce({} as any);

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/edit')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(200);
        });

        it('should fail when user has not sufficient capabilities', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed'
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/edit')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(403);
        });

        it('should fail when you are not logged-in', () => {
            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/edit')
                .set('Cookie', [])
                .expect(401);
        });
    });

    describe('/meals/:id/delete (POST)', () => {
        it('should confirm deleting a meal when user is an admin', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed',
                isAdmin: true
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');
            jest.spyOn(mealService, 'confirmDeleting').mockReturnValueOnce({} as any);

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/delete')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(200);
        });

        it('should confirm deleting a meal when user has canDelete capability', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed',
                capabilities: {
                    canDelete: true
                }
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');
            jest.spyOn(mealService, 'confirmDeleting').mockReturnValueOnce({} as any);

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/delete')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(200);
        });

        it('should fail when user has not sufficient capabilities', () => {
            const mockUser = {
                _id: '635981f6e40f61599e839aaa',
                login: 'user',
                password: 'hashed'
            } as any;

            jest.spyOn(jwtManagerService, 'verifyAccessToken').mockResolvedValue(mockUser);
            jest.spyOn(redisService, 'get').mockResolvedValue('token');

            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/delete')
                .set('Cookie', ['accessToken=token'])
                .set('Authorization', 'Bearer token')
                .expect(403);
        });

        it('should fail when you are not logged-in', () => {
            return request(app.getHttpServer())
                .post('/meals/635981f6e40f61599e839aaa/delete')
                .set('Cookie', [])
                .expect(401);
        });
    });
});