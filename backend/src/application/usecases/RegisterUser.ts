import type { UserType } from "../../domain/entities/User.js"
import type { IUserRepository } from "../../domain/interfaces/repositories.js"
import type { IUseCase } from "../../domain/interfaces/usecases.js"

type RegisterUserParams = { fingerprint: string; lastIp?: string | undefined }

class RegisterUser implements IUseCase<RegisterUserParams, UserType> {
  private _userRepository: IUserRepository

  constructor({ userRepository }: { userRepository: IUserRepository }) {
    this._userRepository = userRepository
  }

  async execute({ fingerprint, lastIp }: RegisterUserParams): Promise<UserType> {
    return await this._userRepository.upsertByFingerprint({ fingerprint, lastIp })
  }
}

export default RegisterUser
