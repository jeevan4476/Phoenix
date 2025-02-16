require("dotenv").config();
import { 
    Keypair,
    Connection,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
    TransactionInstruction} from "@solana/web3.js";

import * as phoenixSdk from "@ellipsis-labs/phoenix-sdk";

export const execute = async () =>{
    const REFRESH_FREQUENCY_IN_MS =  2000; //Refresh time: 2secs
    const MAX_ITERATIONS = 3;

    const ORDER_LIFETIME_IN_SECS = 7;  //MAX time of an order is valid for
    const EDGE = 0.5;
    let counter = 0;

    let privateKeyArray; // Private Key of the user

    if (!process.env.PRIVATE_KEY){
        throw new Error("Missing PRIVATE_KEY in your .env file");
    }

    try {
        privateKeyArray = JSON.parse(process.env.PRIVATE_KEY);
      } catch (error) {
        throw new Error(
          "Error parsing PRIVATE_KEY. Please make sure it is a stringified array"
        );
      }

    let traderKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    
    const marketPubkey = new PublicKey(
        "4DoNfFBfF7UokCC2FQzriy7yHK6DY6NVdYpuekQ5pRgg"
    );

    const endpoint = "https://api.mainnet-beta.solana.com";

    const connection  = new Connection(endpoint);

    const client = await phoenixSdk.Client.create(connection);

    const marketState = client.marketStates.get(marketPubkey.toString());

    const marketData = marketState?.data;

    if (!marketData) {
        throw new Error("Market data not found");
    }
    
    const setupNewMarker = await phoenixSdk.getMakerSetupInstructionsForMarket(
        connection,
        marketState,
        traderKeypair.publicKey
    )

    if(setupNewMarker.length!==0){
        const setup = new Transaction().add(...setupNewMarker);
        const setupTxId = await sendAndConfirmTransaction(
            connection,
            setup,
            [traderKeypair],
            {
                skipPreflight:true,
                commitment:"confirmed",
            }
        );
        console.log(`Setup Tx Link: https://beta.solscan.io/tx/${setupTxId}`);
    }else{
        console.log("No setup req, continue");
    }
    do{
        //Before quoting, we cancel all the outstanding orders
        const cancelAll = client.createCancelAllOrdersInstruction(
            marketPubkey.toString(),
            traderKeypair.publicKey
        )

        try{
            const cancelTransaction = new Transaction().add(cancelAll);
            const txid = await sendAndConfirmTransaction(
                connection,
                cancelTransaction,
                [traderKeypair],
                {
                    skipPreflight:true,
                    commitment:"confirmed"
                }
            );
            console.log("Cancel tx link: https://beta.solscan.io/tx/" + txid);
        }
        catch(e){
            console.log("Error:",e);
            continue;
        }
        try{
            //Get the current SOL price from cointbase via api        
            const response = await fetch(
                "https://api.coinbase.com/v2/prices/SOL-USD/spot"
            ) 
    
            if(!response.ok) throw new Error(`error! Status: ${response.status}`);
    
    
            const data: any = await response.json();

            if(!data.data || !data.data.amount){
                throw new Error("Ivalid response structure");
            }

            const price = parseFloat(data.data.amount);

            let bidPrice = price-EDGE;
            let askPrice = price+EDGE;
            
            console.log(`SOL price: ${price}`);
            console.log(`Placing bid (buy) order at: ${bidPrice}`);
            console.log(`Placing ask (sell) order at: ${askPrice}`);

            const currentTime = Math.floor(Date.now()/1000);

            const bidOrderTemplate : phoenixSdk.LimitOrderTemplate = {
                side : phoenixSdk.Side.Bid,
                priceAsFloat:bidPrice,
                sizeInBaseUnits:1,
                selfTradeBehavior:phoenixSdk.SelfTradeBehavior.Abort,   //Avioding the order from being matched
                clientOrderId:1,   //limit order
                useOnlyDepositedFunds:false,  //Setting to true, might led deduction in the balance from the trader's wallet
                lastValidSlot:undefined,
                lastValidUnixTimestampInSeconds:currentTime+ORDER_LIFETIME_IN_SECS
            }

            const bidLimitOderIx = client.getLimitOrderInstructionfromTemplate(
                marketPubkey.toBase58(),
                traderKeypair.publicKey,
                bidOrderTemplate
            )

            const askOrderTemplate : phoenixSdk.LimitOrderTemplate = {
                side : phoenixSdk.Side.Ask,
                priceAsFloat:askPrice,
                sizeInBaseUnits:1,
                selfTradeBehavior:phoenixSdk.SelfTradeBehavior.Abort,   //Avioding the order from being matched
                clientOrderId:1,   //limit order
                useOnlyDepositedFunds:false,  //Setting to true, might led deduction in the balance from the trader's wallet
                lastValidSlot:undefined,
                lastValidUnixTimestampInSeconds:currentTime+ORDER_LIFETIME_IN_SECS
            
            }

            const askLimitOderIx = client.getLimitOrderInstructionfromTemplate(
                marketPubkey.toBase58(),
                traderKeypair.publicKey,
                askOrderTemplate
            )

            let instructions : TransactionInstruction[] = [];

            if(counter<MAX_ITERATIONS){
                instructions = [bidLimitOderIx,askLimitOderIx];
            }

            //If stratergy has been executed for MAX_ITERATIONS times withdraw the funds from the exchnage,

            if(counter === MAX_ITERATIONS){
                const withdrawParams: phoenixSdk.WithdrawParams = {
                    quoteLotsToWithdraw: null,
                    baseLotsToWithdraw: null,
                  };
                  const placeWithdraw = client.createWithdrawFundsInstruction(
                    {
                      withdrawFundsParams: withdrawParams,
                    },
                    marketPubkey.toString(),
                    traderKeypair.publicKey
                  );
                  instructions.push(placeWithdraw);
                }
                
                // Send place orders/withdraw transaction
      try {
        const placeQuotesTx = new Transaction().add(...instructions);

        const placeQuotesTxId = await sendAndConfirmTransaction(
          connection,
          placeQuotesTx,
          [traderKeypair],
          {
            skipPreflight: true,
            commitment: "confirmed",
          }
        );

        console.log(
          "Place quotes",
          bidPrice.toFixed(marketState.getPriceDecimalPlaces()),
          "@",
          askPrice.toFixed(marketState.getPriceDecimalPlaces())
        );
        console.log(`Tx link: https://solscan.io/tx/${placeQuotesTxId}`);
      } catch (err) {
        console.log("Error: ", err);
        continue;
      }
            counter+=1;
            await delay(REFRESH_FREQUENCY_IN_MS);
        }catch(e){
            console.log(e)
        }
    }while(counter <MAX_ITERATIONS);
}

export const delay = (time : number) =>{
    return new Promise<void>((resolve)=>setTimeout(resolve,time));
}
execute();