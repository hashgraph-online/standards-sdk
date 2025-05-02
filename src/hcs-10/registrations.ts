import { Logger } from '../utils/logger';
import { HCS11Client } from '../hcs-11/client';
import { sleep } from '../utils/sleep';
import {
  RegistrationSearchResult,
  RegistrationResult,
  RegistrationsApiResponse,
  RegistrationSearchOptions,
} from './types';

export interface RegistrationStatusResponse {
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

export abstract class Registration {
  /**
   * Checks the status of a registration request.
   *
   * @param transactionId - The transaction ID of the registration.
   * @param network - The network to use for the registration.
   * @param baseUrl - The base URL of the guarded registry.
   * @param logger - The logger to use for logging.
   * @returns A promise that resolves to the registration status response.
   */
  protected async checkRegistrationStatus(
    transactionId: string,
    network: string,
    baseUrl: string,
    logger?: Logger
  ): Promise<RegistrationStatusResponse> {
    try {
      const response = await fetch(`${baseUrl}/api/request-confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Network': network,
        },
        body: JSON.stringify({ transaction_id: transactionId }),
      });

      if (!response.ok) {
        const error = `Failed to confirm registration: ${response.statusText}`;
        if (logger) {
          logger.error(error);
        }
        throw new Error(error);
      }

      return (await response.json()) as RegistrationStatusResponse;
    } catch (error: any) {
      if (logger) {
        logger.error(`Error checking registration status: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Waits for a registration to be confirmed.
   *
   * @param transactionId - The transaction ID of the registration.
   * @param network - The network to use for the registration.
   * @param baseUrl - The base URL of the guarded registry.
   * @param maxAttempts - The maximum number of attempts to check the registration status.
   * @param delayMs - The delay in milliseconds between attempts.
   * @param logger - The logger to use for logging.
   * @returns A promise that resolves to true if the registration is confirmed, false otherwise.
   */
  async waitForRegistrationConfirmation(
    transactionId: string,
    network: string,
    baseUrl: string,
    maxAttempts: number = 60,
    delayMs: number = 2000,
    logger?: Logger
  ): Promise<boolean> {
    let attempts = 0;
    while (attempts < maxAttempts) {
      if (logger) {
        logger.info(
          `Checking registration status. Attempt ${attempts + 1}/${maxAttempts}`
        );
      }

      const status = await this.checkRegistrationStatus(
        transactionId,
        network,
        baseUrl,
        logger
      );

      if (status.status === 'success') {
        if (logger) {
          logger.info('Registration confirmed successfully');
        }
        return true;
      }

      if (status.status === 'failed') {
        if (logger) {
          logger.error('Registration confirmation failed');
        }
        throw new Error('Registration confirmation failed');
      }

      if (logger) {
        logger.info(
          `Registration still pending. Waiting ${delayMs}ms before next attempt`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempts++;
    }

    if (logger) {
      logger.warn(`Registration not confirmed after ${maxAttempts} attempts`);
    }
    return false;
  }

  /**
   * Executes a registration request for an agent.
   *
   * @param accountId - The account ID of the agent to register.
   * @param network - The network to use for the registration.
   * @param baseUrl - The base URL of the guarded registry.
   * @param logger - The logger to use for logging.
   * @returns A promise that resolves to the registration result.
   */
  async executeRegistration(
    accountId: string,
    network: string = 'mainnet',
    baseUrl: string = 'https://moonscape.tech',
    logger?: Logger
  ): Promise<RegistrationResult> {
    try {
      if (logger) {
        logger.info('Registering agent with guarded registry');
      }

      try {
        const hcs11Client = new HCS11Client({
          network: network as 'mainnet' | 'testnet',
          auth: { operatorId: '0.0.0' },
        });
        logger?.info(
          `Fetching profile by account ID ${accountId} on ${network}`
        );
        await sleep(5000);
        const profileResult = await hcs11Client.fetchProfileByAccountId(
          accountId,
          network
        );
        logger?.info('Profile fetched', profileResult);

        if (profileResult?.error) {
          logger?.error('Error fetching profile', profileResult.error);
          return {
            error: profileResult.error,
            success: false,
          };
        }
        if (!profileResult?.success || !profileResult?.profile) {
          if (logger) {
            logger.error('Profile not found for agent registration');
          }
          return {
            error: 'Profile not found for the provided account ID',
            success: false,
          };
        }

        if (!profileResult.profile.inboundTopicId) {
          if (logger) {
            logger.error('Missing inbound topic ID in profile');
          }
          return {
            error: 'Profile is missing required inbound topic ID',
            success: false,
          };
        }

        if (!profileResult.profile.outboundTopicId) {
          if (logger) {
            logger.error('Missing outbound topic ID in profile');
          }
          return {
            error: 'Profile is missing required outbound topic ID',
            success: false,
          };
        }

        if (logger) {
          logger.info(
            `Profile validation successful. Inbound topic: ${profileResult.profile.inboundTopicId}, Outbound topic: ${profileResult.profile.outboundTopicId}`
          );
        }
      } catch (profileError: any) {
        if (logger) {
          logger.error(`Error validating profile: ${profileError.message}`);
        }
        return {
          error: `Error validating profile: ${profileError.message}`,
          success: false,
        };
      }

      const response = await fetch(`${baseUrl}/api/request-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'Accept-Language': 'en;q=0.5',
          Origin: baseUrl,
          Referer: `${baseUrl}/`,
          'X-Network': network,
        },
        body: JSON.stringify({
          accountId,
        }),
      });

      const data = (await response.json()) as RegistrationsApiResponse;

      if (!response.ok) {
        if (data.details?.length > 0) {
          return {
            validationErrors: data.details,
            error: data.error || 'Validation failed',
            success: false,
          };
        }
        return {
          error: data.error || 'Failed to register agent',
          success: false,
        };
      }

      if (logger) {
        logger.info(
          `Created new registration request. Transaction ID: ${data.transaction_id}`
        );
      }

      return {
        transactionId: data.transaction_id,
        transaction: data.transaction,
        success: true,
      };
    } catch (error: any) {
      return {
        error: `Error during registration request: ${error.message}`,
        success: false,
      };
    }
  }

  /**
   * Finds registrations based on the provided options.
   *
   * @param options - The options for searching registrations.
   * @param baseUrl - The base URL of the guarded registry.
   * @returns A promise that resolves to the registration search result.
   */
  async findRegistrations(
    options: RegistrationSearchOptions = {},
    baseUrl: string = 'https://moonscape.tech'
  ): Promise<RegistrationSearchResult> {
    try {
      const queryParams = new URLSearchParams();
      options.tags?.forEach((tag) =>
        queryParams.append('tags', tag.toString())
      );
      if (options.accountId) {
        queryParams.append('accountId', options.accountId);
      }
      if (options.network) {
        queryParams.append('network', options.network);
      }

      const response = await fetch(
        `${baseUrl}/api/registrations?${queryParams}`,
        {
          headers: {
            Accept: '*/*',
            'Accept-Language': 'en;q=0.5',
            Origin: baseUrl,
            Referer: `${baseUrl}/`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return {
          registrations: [],
          error: error || 'Failed to fetch registrations',
          success: false,
        };
      }

      const data = (await response.json()) as RegistrationsApiResponse;
      if (data.error) {
        return {
          registrations: [],
          error: data.error,
          success: false,
        };
      }

      return {
        registrations: data.registrations || [],
        success: true,
      };
    } catch (e) {
      const error = e as Error;
      return {
        registrations: [],
        error: `Error fetching registrations: ${error.message}`,
        success: false,
      };
    }
  }
}
