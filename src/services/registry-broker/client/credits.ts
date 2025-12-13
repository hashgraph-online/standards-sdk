import type {
  CreditPurchaseResponse,
  JsonObject,
  JsonValue,
  X402CreditPurchaseResponse,
  X402MinimumsResponse,
} from '../types';
import {
  creditPurchaseResponseSchema,
  x402CreditPurchaseResponseSchema,
  x402MinimumsResponseSchema,
} from '../schemas';
import { RegistryBrokerClient } from './base-client';
import { normalizeHexPrivateKey, type X402NetworkId } from './utils';
import { optionalImport } from '../../../utils/dynamic-import';

type PaymentHeaders = Record<string, string | string[] | undefined>;
type PaymentClient = {
  post: (
    url: string,
    body: JsonObject,
  ) => Promise<{ data: JsonValue; headers?: PaymentHeaders }>;
};

interface PurchaseCreditsWithX402Params {
  accountId: string;
  credits: number;
  usdAmount?: number;
  description?: string;
  metadata?: JsonObject;
  walletClient: object;
}

interface BuyCreditsWithX402Params {
  accountId: string;
  credits: number;
  usdAmount?: number;
  description?: string;
  metadata?: JsonObject;
  evmPrivateKey: string;
  network?: X402NetworkId;
  rpcUrl?: string;
}

type X402PurchaseResult = X402CreditPurchaseResponse & {
  paymentResponseHeader?: string;
  paymentResponse?: unknown;
};

type LoadX402DependenciesResult = {
  createPaymentClient: (walletClient: object) => PaymentClient;
  decodePaymentResponse: (value: string) => unknown;
  createX402Signer: (
    network: X402NetworkId,
    privateKey: `0x${string}`,
  ) => Promise<object>;
};

async function loadX402Dependencies(
  client: RegistryBrokerClient,
): Promise<LoadX402DependenciesResult> {
  type X402AxiosModule = {
    withPaymentInterceptor: (client: unknown, walletClient: object) => unknown;
    decodeXPaymentResponse: (value: string) => unknown;
  };
  type X402TypesModule = {
    createSigner: (
      network: X402NetworkId,
      privateKey: `0x${string}`,
    ) => Promise<object>;
  };

  const [{ default: axios }, x402Axios, x402Types] = await Promise.all([
    import('axios'),
    optionalImport<X402AxiosModule>('x402-axios'),
    optionalImport<X402TypesModule>('x402/types'),
  ]);

  if (!x402Axios || !x402Types) {
    throw new Error(
      'x402-axios and x402/types are required for X402 flows. Install them to enable ledger payments.',
    );
  }

  const withPaymentInterceptor = x402Axios.withPaymentInterceptor;
  const decodePaymentResponse = x402Axios.decodeXPaymentResponse;
  const createX402Signer = x402Types.createSigner;

  const createPaymentClient = (walletClient: object): PaymentClient => {
    const axiosClient = axios.create({
      baseURL: client.baseUrl,
      headers: {
        ...client.getDefaultHeaders(),
        'content-type': 'application/json',
      },
    });
    const paymentClient = withPaymentInterceptor(axiosClient, walletClient);
    return paymentClient as PaymentClient;
  };

  return { createPaymentClient, decodePaymentResponse, createX402Signer };
}

function calculateHbarAmountParam(hbarAmount: number): number {
  const tinybars = Math.ceil(hbarAmount * 1e8);
  if (tinybars <= 0) {
    throw new Error('Calculated purchase amount must be positive');
  }
  return tinybars / 1e8;
}

declare module './base-client' {
  interface RegistryBrokerClient {
    purchaseCreditsWithHbar(params: {
      accountId: string;
      privateKey: string;
      hbarAmount: number;
      memo?: string;
      metadata?: JsonObject;
    }): Promise<CreditPurchaseResponse>;
    getX402Minimums(): Promise<X402MinimumsResponse>;
    purchaseCreditsWithX402(
      params: PurchaseCreditsWithX402Params,
    ): Promise<X402PurchaseResult>;
    buyCreditsWithX402(
      params: BuyCreditsWithX402Params,
    ): Promise<X402PurchaseResult>;
  }
}

RegistryBrokerClient.prototype.purchaseCreditsWithHbar = async function (
  this: RegistryBrokerClient,
  params: {
    accountId: string;
    privateKey: string;
    hbarAmount: number;
    memo?: string;
    metadata?: JsonObject;
  },
): Promise<CreditPurchaseResponse> {
  const body: JsonObject = {
    accountId: params.accountId,
    payerKey: params.privateKey,
    hbarAmount: calculateHbarAmountParam(params.hbarAmount),
  };

  if (params.memo) {
    body.memo = params.memo;
  }

  if (params.metadata) {
    body.metadata = params.metadata;
  }

  const raw = await this.requestJson<JsonValue>('/credits/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  return this.parseWithSchema(
    raw,
    creditPurchaseResponseSchema,
    'credit purchase response',
  );
};

RegistryBrokerClient.prototype.getX402Minimums = async function (
  this: RegistryBrokerClient,
): Promise<X402MinimumsResponse> {
  const raw = await this.requestJson<JsonValue>(
    '/credits/purchase/x402/minimums',
    { method: 'GET' },
  );
  return this.parseWithSchema(
    raw,
    x402MinimumsResponseSchema,
    'x402 minimums response',
  );
};

RegistryBrokerClient.prototype.purchaseCreditsWithX402 = async function (
  this: RegistryBrokerClient,
  params: PurchaseCreditsWithX402Params,
): Promise<X402PurchaseResult> {
  const { createPaymentClient, decodePaymentResponse } =
    await loadX402Dependencies(this);

  if (!Number.isFinite(params.credits) || params.credits <= 0) {
    throw new Error('credits must be a positive number');
  }
  if (
    params.usdAmount !== undefined &&
    (!Number.isFinite(params.usdAmount) || params.usdAmount <= 0)
  ) {
    throw new Error('usdAmount must be a positive number when provided');
  }

  const body: JsonObject = {
    accountId: params.accountId,
    credits: params.credits,
  };

  if (params.usdAmount !== undefined) {
    body.usdAmount = params.usdAmount;
  }
  if (params.description) {
    body.description = params.description;
  }
  if (params.metadata) {
    body.metadata = params.metadata;
  }

  const paymentClient = createPaymentClient(params.walletClient);

  const response = await paymentClient.post('/credits/purchase/x402', body);

  const parsed = this.parseWithSchema(
    response.data,
    x402CreditPurchaseResponseSchema,
    'x402 credit purchase response',
  );

  const responseHeaders = response.headers ?? {};
  const paymentHeader =
    typeof responseHeaders['x-payment-response'] === 'string'
      ? responseHeaders['x-payment-response']
      : undefined;
  const decodedPayment =
    paymentHeader !== undefined
      ? decodePaymentResponse(paymentHeader)
      : undefined;

  return {
    ...parsed,
    paymentResponseHeader: paymentHeader,
    paymentResponse: decodedPayment,
  };
};

RegistryBrokerClient.prototype.buyCreditsWithX402 = async function (
  this: RegistryBrokerClient,
  params: BuyCreditsWithX402Params,
): Promise<X402PurchaseResult> {
  const network: X402NetworkId = params.network ?? 'base';
  const { createX402Signer } = await loadX402Dependencies(this);
  const normalizedKey = normalizeHexPrivateKey(params.evmPrivateKey);
  const walletClient = await createX402Signer(network, normalizedKey);

  return this.purchaseCreditsWithX402({
    accountId: params.accountId,
    credits: params.credits,
    usdAmount: params.usdAmount,
    description: params.description,
    metadata: params.metadata,
    walletClient,
  });
};
