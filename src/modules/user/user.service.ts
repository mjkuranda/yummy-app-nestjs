import { Injectable } from '@nestjs/common';
import { CreateUserDto, UserDto, UserLoginDto } from './user.dto';
import { UserDocument } from '../../mongodb/documents/user.document';
import { isValidObjectId } from 'mongoose';
import { JwtManagerService } from '../jwt-manager/jwt-manager.service';
import { BadRequestException } from '../../exceptions/bad-request.exception';
import { LoggerService } from '../logger/logger.service';
import { NotFoundException } from '../../exceptions/not-found.exception';
import { CapabilityType, UserObject, UserPermissions, UserProfile } from './user.types';
import { MailManagerService } from '../mail-manager/mail-manager.service';
import { UserActionDocument } from '../../mongodb/documents/user-action.document';
import { ForbiddenException } from '../../exceptions/forbidden-exception';
import { UserRepository } from '../../mongodb/repositories/user.repository';
import { UserActionRepository } from '../../mongodb/repositories/user.action.repository';
import { RedisService } from '../redis/redis.service';
import { Response } from 'express';
import { isTooShortToExpireRefreshToken } from '../jwt-manager/jwt-manager.utils';
import { UserAccessTokenPayload } from '../jwt-manager/jwt-manager.types';
import { PasswordManagerService } from '../password-manager/password-manager.service';

@Injectable()
export class UserService {

    constructor(
        private readonly userRepository: UserRepository,
        private readonly userActionRepository: UserActionRepository,
        private readonly redisService: RedisService,
        private readonly jwtManagerService: JwtManagerService,
        private readonly loggerService: LoggerService,
        private readonly mailManagerService: MailManagerService,
        private readonly passwordManagerService: PasswordManagerService
    ) {}

    async getAllUsers(): Promise<UserObject[]> {
        return await this.userRepository.getAll();
    }

    async loginUser(userLoginDto: UserLoginDto, res: Response): Promise<UserPermissions> {
        const { login, password } = userLoginDto;
        const context = 'UserService/loginUser';
        const user = await this.userRepository.findByLogin(login);

        if (!user) {
            const message = `User ${login} does not exist`;
            this.loggerService.error(context, message);

            throw new NotFoundException(context, message);
        }

        if (!user.activated) {
            const message = `User "${user.login}" is not a valid account. You need to activate its first.`;
            this.loggerService.error(context, message);

            throw new ForbiddenException(context, message);
        }

        const areTheSamePasswords = await this.passwordManagerService.areEqualPasswords({
            password,
            salt: user.salt,
            pepper: process.env.PASSWORD_PEPPER
        }, user.password);

        if (!areTheSamePasswords) {
            const message = `Incorrect credentials for user "${login}".`;
            this.loggerService.error(context, message);

            throw new BadRequestException(context, message);
        }

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const accessToken = await this.jwtManagerService.generateAccessToken({ login, isAdmin: user.isAdmin, capabilities: user.capabilities });
        const refreshToken = await this.jwtManagerService.generateRefreshToken({ login });

        await this.redisService.setTokens(login, accessToken, refreshToken);
        res.cookie('accessToken', accessToken, { httpOnly: true, sameSite: 'none', secure: true });
        res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'none', secure: true });

        const message = `User "${login}" has been successfully logged in.`;
        this.loggerService.info(context, message);

        return {
            ...(user.isAdmin !== undefined && { isAdmin: user.isAdmin }),
            ...(user.capabilities !== undefined && { capabilities: user.capabilities })
        };
    }

    async logoutUser(res: Response, login: string, accessToken: string, refreshToken: string): Promise<void> {
        try {
            await this.redisService.unsetTokens(login, accessToken, refreshToken);
        } catch (err: any) {
            throw err;
        }

        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');

        this.loggerService.info('UserService/logout', `User ${login} has already logged out.`);
    }

    async refreshTokens(userPayload: UserAccessTokenPayload, accessToken: string, res: Response): Promise<void> {
        const refreshToken = await this.redisService.getRefreshToken(userPayload.login);
        const context = 'UserService/refreshTokens';

        if (!refreshToken) {
            throw new ForbiddenException(context, `User ${userPayload.login} doesn't have alive refresh token.`);
        }

        const newAccessToken = await this.jwtManagerService.generateAccessToken(userPayload);
        res.cookie('accessToken', newAccessToken, { httpOnly: true, sameSite: 'none', secure: true });
        this.loggerService.info(context, `Access token was renewed for ${userPayload.login} user.`);
        const refreshTokenPayload = await this.jwtManagerService.verifyRefreshToken(refreshToken);
        let newRefreshToken = null;

        if (isTooShortToExpireRefreshToken(refreshTokenPayload)) {
            newRefreshToken = await this.jwtManagerService.generateRefreshToken(refreshTokenPayload);
            res.cookie('refreshToken', newRefreshToken, { httpOnly: true, sameSite: 'none', secure: true });
            this.loggerService.info(context, `Refresh token was renewed for ${userPayload.login} user.`);
        }

        await this.redisService.setTokens(userPayload.login, newAccessToken, newRefreshToken);
    }

    async createUser(createUserDto: CreateUserDto): Promise<UserDocument> {
        const context = 'UserService/createUser';

        if (await this.userRepository.findByLogin(createUserDto.login)) {
            const message = `User with "${createUserDto.login}" login has already exists`;
            this.loggerService.error(context, message);

            throw new BadRequestException(context, message);
        }

        const salt = await this.passwordManagerService.generateSalt();
        const hashedPassword = await this.passwordManagerService.getHashedPassword({
            password: createUserDto.password,
            salt,
            pepper: process.env.PASSWORD_PEPPER
        });
        const newUser = await this.userRepository.create({
            email: createUserDto.email,
            login: createUserDto.login,
            password: hashedPassword,
            salt: salt
        }) as UserDocument;
        const userActionRecord = await this.userActionRepository.create({
            userId: newUser._id,
            type: 'activate'
        }) as UserActionDocument;
        await this.mailManagerService.sendActivationMail(newUser.email, newUser.login, userActionRecord._id);
        const message = `Created user "${newUser.login}" with id "${newUser._id}". To activate its, use: "${userActionRecord._id}" activation code.`;
        this.loggerService.info(context, message);

        return newUser;
    }

    async grantPermission(user: UserDto, byUser: UserDto, capability: CapabilityType): Promise<boolean> {
        const context = 'UserService/grantPermission';

        if (!user) {
            const message = 'Failed action to grant a permission. User with provided login does not exist.';
            this.loggerService.error(context, message);

            throw new NotFoundException(context, message);
        }

        if (user.capabilities && user.capabilities[capability]) {
            this.loggerService.info(context, `User "${user.login}" has provided capability.`);

            return false;
        }

        await this.userRepository.updateOne(
            {
                _id: user._id,
                login: user.login
            },
            {
                $set: {
                    capabilities: {
                        ...user.capabilities,
                        [capability]: true
                    }
                }
            }
        );
        this.loggerService.info(context, `User "${byUser.login}" has granted permission "${capability}" to "${user.login}" user.`);

        return true;
    }

    async denyPermission(user: UserDto, byUser: UserDto, capability: CapabilityType): Promise<boolean> {
        const context = 'UserService/denyPermission';

        if (!user) {
            const message = 'Failed action to deny a permission. User with provided login does not exist.';
            this.loggerService.error(context, message);

            throw new NotFoundException(context, message);
        }

        if (!user.capabilities || !user.capabilities[capability]) {
            this.loggerService.info(context, `User "${user.login}" has not provided capability.`);

            return false;
        }

        const newCapabilities = user.capabilities;
        delete newCapabilities[capability];

        await this.userRepository.updateOne(
            {
                _id: user._id,
                login: user.login
            },
            {
                $set: {
                    capabilities: newCapabilities
                }
            }
        );
        this.loggerService.info(context, `User "${byUser.login}" has denied permission "${capability}" to "${user.login}" user.`);

        return true;
    }

    async activate(userActionId: string): Promise<void> {
        const context = 'UserService/activate';

        if (!isValidObjectId(userActionId)) {
            const message = 'Invalid activation token.';
            this.loggerService.error(context, message);

            throw new BadRequestException(context, message);
        }

        const userAction = await this.userActionRepository.findById(userActionId) as UserActionDocument;

        if (!userAction) {
            const message = `Not found any request with "${userActionId}" activation token.`;
            this.loggerService.error(context, message);

            throw new NotFoundException(context, message);
        }

        const user = await this.userRepository.findById(userAction.userId) as UserDocument;

        if (!user) {
            const message = `User with id "${userAction.userId}" does not exist, reported by "${userActionId}" request token for activation.`;
            this.loggerService.error(context, message);

            throw new BadRequestException(context, message);
        }

        if (user.activated) {
            const message = `User "${user._id}" has already activated.`;
            this.loggerService.info(context, message);
            await this.userActionRepository.deleteOne({ _id: userActionId });

            return;
        }

        await this.userActionRepository.deleteOne({ _id: userActionId });
        await this.userRepository.updateOne({ _id: user._id }, {
            $set: {
                activated: new Date().getTime()
            }
        });
        this.loggerService.info(context, `User "${user._id}" has been successfully activated!`);
    }

    async getNotActivated() {
        return await this.userRepository.getAllNotActivated();
    }

    async activateViaId(id: string): Promise<void> {
        const context = 'UserService/activateViaId';
        const userAction = await this.userActionRepository.findOne({ userId: id });

        if (!userAction) {
            const message = `Not found any request for activation for "${id}" user.`;
            this.loggerService.error(context, message);

            throw new NotFoundException(context, message);
        }

        const user = await this.userRepository.findById(userAction.userId);

        if (!user) {
            const message = `User with id "${userAction.userId}" does not exist.`;
            this.loggerService.error(context, message);

            throw new BadRequestException(context, message);
        }

        if (user.activated) {
            const message = `User "${id}" has already activated.`;
            this.loggerService.info(context, message);
            await this.userActionRepository.deleteOne({ _id: userAction._id });

            return;
        }

        await this.userActionRepository.deleteOne({ _id: userAction._id });
        await this.userRepository.updateOne({ _id: user._id }, {
            $set: {
                activated: new Date().getTime()
            }
        });
        this.loggerService.info(context, `User "${id}" has been successfully activated!`);
    }

    async changePassword(login: string, password: string): Promise<void> {
        const salt = await this.passwordManagerService.generateSalt();
        const hashedPassword = await this.passwordManagerService.getHashedPassword({
            password,
            salt,
            pepper: process.env.PASSWORD_PEPPER
        });

        await this.userRepository.changePassword(login, hashedPassword, salt);
        this.loggerService.info('UserService/changePassword', `User "${login}" has successfully changed its password!`);
    }

    async getProfile(login: string): Promise<UserProfile> {
        const user = await this.userRepository.getProfile(login);

        if (!user) {
            throw new NotFoundException('UserService/getProfile', `User with "${login}" login has not been found.`);
        }

        return user;
    }
}
