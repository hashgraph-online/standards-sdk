import { proto } from '@hashgraph/proto';
import { UtilPrngData } from '../transaction-parser-types';

export class UtilParser {
  static parseUtilPrng(
    body: proto.IUtilPrngTransactionBody,
  ): UtilPrngData | undefined {
    if (!body) return undefined;
    const data: UtilPrngData = {};
    if (body.range && body.range !== 0) {
      data.range = body.range;
    }
    return data;
  }
}
