"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.delay = exports.execute = void 0;
require("dotenv").config();
const web3_js_1 = require("@solana/web3.js");
const phoenixSdk = __importStar(require("@ellipsis-labs/phoenix-sdk"));
const execute = () => __awaiter(void 0, void 0, void 0, function* () {
    const REFRESH_FREQUENCY_IN_MS = 2000; //Refresh time: 2secs
    const MAX_ITERATIONS = 3;
    const ORDER_LIFETIME_IN_SECS = 7; //MAX time of an order is valid for
    const EDGE = 0.5;
    let counter = 0;
    let privateKeyArray; // Private Key of the user
    if (!process.env.PRIVATE_KEY) {
        throw new Error("Missing PRIVATE_KEY in your .env file");
    }
    try {
        privateKeyArray = JSON.parse(process.env.PRIVATE_KEY);
    }
    catch (error) {
        throw new Error("Error parsing PRIVATE_KEY. Please make sure it is a stringified array");
    }
    let traderKeypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    const marketPubkey = new web3_js_1.PublicKey("4DoNfFBfF7UokCC2FQzriy7yHK6DY6NVdYpuekQ5pRgg");
    const endpoint = "https://api.mainnet-beta.solana.com";
    const connection = new web3_js_1.Connection(endpoint);
    const client = yield phoenixSdk.Client.create(connection);
    const marketState = client.marketStates.get(marketPubkey.toString());
    const marketData = marketState === null || marketState === void 0 ? void 0 : marketState.data;
    if (!marketData) {
        throw new Error("Market data not found");
    }
    const setupNewMarker = yield phoenixSdk.getMakerSetupInstructionsForMarket(connection, marketState, traderKeypair.publicKey);
    if (setupNewMarker.length !== 0) {
        const setup = new web3_js_1.Transaction().add(...setupNewMarker);
        const setupTxId = yield (0, web3_js_1.sendAndConfirmTransaction)(connection, setup, [traderKeypair], {
            skipPreflight: true,
            commitment: "confirmed",
        });
        console.log(`Setup Tx Link: https://beta.solscan.io/tx/${setupTxId}`);
    }
    else {
        console.log("No setup req, continue");
    }
    do {
        //Before quoting, we cancel all the outstanding orders
        const cancelAll = client.createCancelAllOrdersInstruction(marketPubkey.toString(), traderKeypair.publicKey);
        try {
            const cancelTransaction = new web3_js_1.Transaction().add(cancelAll);
            const txid = yield (0, web3_js_1.sendAndConfirmTransaction)(connection, cancelTransaction, [traderKeypair], {
                skipPreflight: true,
                commitment: "confirmed"
            });
            console.log("Cancel tx link: https://beta.solscan.io/tx/" + txid);
        }
        catch (e) {
            console.log("Error:", e);
            continue;
        }
        try {
            //Get the current SOL price from cointbase via api        
            const response = yield fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot");
            if (!response.ok)
                throw new Error(`error! Status: ${response.status}`);
            const data = yield response.json();
            if (!data.data || !data.data.amount) {
                throw new Error("Ivalid response structure");
            }
            const price = parseFloat(data.data.amount);
            let bidPrice = price - EDGE;
            let askPrice = price + EDGE;
            console.log(`SOL price: ${price}`);
            console.log(`Placing bid (buy) order at: ${bidPrice}`);
            console.log(`Placing ask (sell) order at: ${askPrice}`);
            const currentTime = Math.floor(Date.now() / 1000);
            const bidOrderTemplate = {
                side: phoenixSdk.Side.Bid,
                priceAsFloat: bidPrice,
                sizeInBaseUnits: 1,
                selfTradeBehavior: phoenixSdk.SelfTradeBehavior.Abort, //Avioding the order from being matched
                clientOrderId: 1, //limit order
                useOnlyDepositedFunds: false, //Setting to true, might led deduction in the balance from the trader's wallet
                lastValidSlot: undefined,
                lastValidUnixTimestampInSeconds: currentTime + ORDER_LIFETIME_IN_SECS
            };
            const bidLimitOderIx = client.getLimitOrderInstructionfromTemplate(marketPubkey.toBase58(), traderKeypair.publicKey, bidOrderTemplate);
            const askOrderTemplate = {
                side: phoenixSdk.Side.Ask,
                priceAsFloat: askPrice,
                sizeInBaseUnits: 1,
                selfTradeBehavior: phoenixSdk.SelfTradeBehavior.Abort, //Avioding the order from being matched
                clientOrderId: 1, //limit order
                useOnlyDepositedFunds: false, //Setting to true, might led deduction in the balance from the trader's wallet
                lastValidSlot: undefined,
                lastValidUnixTimestampInSeconds: currentTime + ORDER_LIFETIME_IN_SECS
            };
            const askLimitOderIx = client.getLimitOrderInstructionfromTemplate(marketPubkey.toBase58(), traderKeypair.publicKey, askOrderTemplate);
            let instructions = [];
            if (counter < MAX_ITERATIONS) {
                instructions = [bidLimitOderIx, askLimitOderIx];
            }
            //If stratergy has been executed for MAX_ITERATIONS times withdraw the funds from the exchnage,
            if (counter === MAX_ITERATIONS) {
                const withdrawParams = {
                    quoteLotsToWithdraw: null,
                    baseLotsToWithdraw: null,
                };
                const placeWithdraw = client.createWithdrawFundsInstruction({
                    withdrawFundsParams: withdrawParams,
                }, marketPubkey.toString(), traderKeypair.publicKey);
                instructions.push(placeWithdraw);
            }
            // Send place orders/withdraw transaction
            try {
                const placeQuotesTx = new web3_js_1.Transaction().add(...instructions);
                const placeQuotesTxId = yield (0, web3_js_1.sendAndConfirmTransaction)(connection, placeQuotesTx, [traderKeypair], {
                    skipPreflight: true,
                    commitment: "confirmed",
                });
                console.log("Place quotes", bidPrice.toFixed(marketState.getPriceDecimalPlaces()), "@", askPrice.toFixed(marketState.getPriceDecimalPlaces()));
                console.log(`Tx link: https://solscan.io/tx/${placeQuotesTxId}`);
            }
            catch (err) {
                console.log("Error: ", err);
                continue;
            }
            counter += 1;
            yield (0, exports.delay)(REFRESH_FREQUENCY_IN_MS);
        }
        catch (e) {
            console.log(e);
        }
    } while (counter < MAX_ITERATIONS);
});
exports.execute = execute;
const delay = (time) => {
    return new Promise((resolve) => setTimeout(resolve, time));
};
exports.delay = delay;
(0, exports.execute)();
