import { BigInt, log } from "@graphprotocol/graph-ts";
import {
  ClaimAction,
  ClaimCollateralAction,
  ClaimRef,
  ClaimableFundingFeeInfo,
  Order,
  TokenPrice,
  Transaction
} from "../../generated/schema";
import { EventData,Event1Data,Event2Data } from "../utils/eventData";
import { orderTypes } from "./orders";
import { CollateralClaimedEventData } from "../utils/eventData/CollateralClaimedEventData";
import { getTokenPrice } from "./prices";

let ZERO = BigInt.fromI32(0);
let ONE = BigInt.fromI32(1);

export function saveClaimActionOnOrderCreated(transaction: Transaction, eventData: Event2Data): void {
  let orderId = eventData.getBytes32Item("key")!.toHexString();

  let claimAction = getOrCreateClaimAction2("SettleFundingFeeCreated", eventData, transaction);

  let marketAddress = eventData.getAddressItemString("market")!;
  let marketAddresses = claimAction.marketAddresses;
  marketAddresses.push(marketAddress);
  claimAction.marketAddresses = marketAddresses;

  let isLongOrders = claimAction.isLongOrders;
  isLongOrders.push(eventData.getBoolItem("isLong"));
  claimAction.isLongOrders = isLongOrders;

  claimAction.save();

  createClaimRefIfNotExists(orderId);
}

export function saveClaimActionOnOrderCancelled(transaction: Transaction, eventData: Event2Data): void {
  let claimAction = getOrCreateClaimAction2("SettleFundingFeeCancelled", eventData, transaction);

  let orderId = eventData.getBytes32Item("key")!.toHexString();
  let order = Order.load(orderId);

  if (!order) throw new Error("Order not found");

  let marketAddresses = claimAction.marketAddresses;
  marketAddresses.push(order.marketAddress);
  claimAction.marketAddresses = marketAddresses;

  let isLongOrders = claimAction.isLongOrders;
  isLongOrders.push(order.isLong);
  claimAction.isLongOrders = isLongOrders;

  claimAction.save();
}

export function saveClaimActionOnOrderExecuted(transaction: Transaction, eventData: Event2Data): void {
  let claimAction = getOrCreateClaimAction2("SettleFundingFeeExecuted", eventData, transaction);
  let orderId = eventData.getBytes32Item("key")!.toHexString();
  let order = Order.load(orderId);

  if (!order) throw new Error("Order not found");

  let account = eventData.getAddressItemString("account")!;
  let claimableFundingFeeInfoId = transaction.id + ":" + account;
  let claimableFundingFeeInfo = ClaimableFundingFeeInfo.load(claimableFundingFeeInfoId);

  // if position has no pending funding fees ClaimableFundingUpdated is not emitted
  if (!claimableFundingFeeInfo) {
    return;
  }

  let sourceTokenAddresses = claimableFundingFeeInfo.tokenAddresses;

  for (let i = 0; i < sourceTokenAddresses.length; i++) {
    let sourceTokenAddress = sourceTokenAddresses[i];
    let targetTokenAddresses = claimAction.tokenAddresses;
    targetTokenAddresses.push(sourceTokenAddress);
    claimAction.tokenAddresses = targetTokenAddresses;

    let tokenPrice = getTokenPrice(sourceTokenAddress);
    let tokenPrices = claimAction.tokenPrices;
    tokenPrices.push(tokenPrice);
    claimAction.tokenPrices = tokenPrices;
  }

  let sourceAmounts = claimableFundingFeeInfo.amounts;
  let targetAmounts = claimAction.amounts;

  for (let i = 0; i < sourceAmounts.length; i++) {
    let sourceAmount = sourceAmounts[i];
    targetAmounts.push(sourceAmount);
  }

  claimAction.amounts = targetAmounts;

  let tokensCount = claimableFundingFeeInfo.tokenAddresses.length;
  let marketAddresses = claimAction.marketAddresses;
  let isLongOrders = claimAction.isLongOrders;

  for (let i = 0; i < tokensCount; i++) {
    marketAddresses.push(order.marketAddress);
    isLongOrders.push(order.isLong);
  }

  claimAction.marketAddresses = marketAddresses;
  claimAction.isLongOrders = isLongOrders;

  claimAction.save();
}

export function handleCollateralClaimAction(eventName: string, eventData: Event1Data, transaction: Transaction): void {
  let data = new CollateralClaimedEventData(eventData);
  let claimCollateralAction = getOrCreateClaimCollateralAction(eventName, eventData, transaction);
  let claimAction = getOrCreateClaimAction(eventName, eventData, transaction);

  addFieldsToCollateralLikeClaimAction(claimAction, data);
  addFieldsToCollateralLikeClaimCollateralAction(claimCollateralAction, data);

  claimCollateralAction.save();
  claimAction.save();
}

export function saveClaimableFundingFeeInfo(eventData: Event1Data, transaction: Transaction): ClaimableFundingFeeInfo {
  let account = eventData.getAddressItemString("account")!;
  let id = transaction.id + ":" + account;
  let entity = ClaimableFundingFeeInfo.load(id);

  if (!entity) {
    entity = new ClaimableFundingFeeInfo(id);
    entity.amounts = new Array<BigInt>(0);
    entity.marketAddresses = new Array<string>(0);
    entity.tokenAddresses = new Array<string>(0);
  }

  let marketAddresses = entity.marketAddresses;
  marketAddresses.push(eventData.getAddressItemString("market")!);
  entity.marketAddresses = marketAddresses;

  let tokenAddresses = entity.tokenAddresses;
  tokenAddresses.push(eventData.getAddressItemString("token")!);
  entity.tokenAddresses = tokenAddresses;

  let amounts = entity.amounts;
  amounts.push(eventData.getUintItem("delta")!);
  entity.amounts = amounts;

  entity.save();

  return entity!;
}



function addFieldsToCollateralLikeClaimCollateralAction(claimAction: ClaimCollateralAction, eventData: CollateralClaimedEventData): void {
  let marketAddresses = claimAction.marketAddresses;
  marketAddresses.push(eventData.market);
  claimAction.marketAddresses = marketAddresses;

  let tokenAddresses = claimAction.tokenAddresses;
  tokenAddresses.push(eventData.token);
  claimAction.tokenAddresses = tokenAddresses;

  let tokenPrices = claimAction.tokenPrices;
  let tokenPrice = getTokenPrice(eventData.token);
  tokenPrices.push(tokenPrice);
  claimAction.tokenPrices = tokenPrices;

  let amounts = claimAction.amounts;
  amounts.push(eventData.amount);
  claimAction.amounts = amounts;
}


function addFieldsToCollateralLikeClaimAction(claimAction: ClaimAction, eventData: CollateralClaimedEventData): void {
  let marketAddresses = claimAction.marketAddresses;
  marketAddresses.push(eventData.market);
  claimAction.marketAddresses = marketAddresses;

  let tokenAddresses = claimAction.tokenAddresses;
  tokenAddresses.push(eventData.token);
  claimAction.tokenAddresses = tokenAddresses;

  let tokenPrices = claimAction.tokenPrices;
  let tokenPrice = getTokenPrice(eventData.token);
  tokenPrices.push(tokenPrice);
  claimAction.tokenPrices = tokenPrices;

  let amounts = claimAction.amounts;
  amounts.push(eventData.amount);
  claimAction.amounts = amounts;
}

function getOrCreateClaimCollateralAction(
  eventName: string,
  eventData: Event1Data,
  transaction: Transaction
): ClaimCollateralAction {
  let account = eventData.getAddressItemString("account")!;
  let id = transaction.id + ":" + account + ":" + eventName;
  let entity = ClaimCollateralAction.load(id);

  if (!entity) {
    entity = new ClaimCollateralAction(id);
    entity.marketAddresses = new Array<string>(0);
    entity.tokenAddresses = new Array<string>(0);
    entity.tokenPrices = new Array<BigInt>(0);
    entity.amounts = new Array<BigInt>(0);

    entity.eventName = eventName;
    entity.account = account;
    entity.transaction = transaction.id;
    entity.save();
  }

  return entity as ClaimCollateralAction;
}

function getOrCreateClaimAction(eventName: string, eventData: Event1Data, transaction: Transaction): ClaimAction {
  let account = eventData.getAddressItemString("account")!;
  let id = transaction.id + ":" + account + ":" + eventName;
  let entity = ClaimAction.load(id);

  if (!entity) {
    entity = new ClaimAction(id);
    entity.marketAddresses = new Array<string>(0);
    entity.tokenAddresses = new Array<string>(0);
    entity.tokenPrices = new Array<BigInt>(0);
    entity.amounts = new Array<BigInt>(0);
    entity.isLongOrders = new Array<boolean>(0);

    entity.eventName = eventName;
    entity.account = account;
    entity.transaction = transaction.id;
    entity.save();
  }

  return entity as ClaimAction;
}



function getOrCreateClaimAction2(eventName: string, eventData: Event2Data, transaction: Transaction): ClaimAction {
  let account = eventData.getAddressItemString("account")!;
  let id = transaction.id + ":" + account + ":" + eventName;
  let entity = ClaimAction.load(id);

  if (!entity) {
    entity = new ClaimAction(id);
    entity.marketAddresses = new Array<string>(0);
    entity.tokenAddresses = new Array<string>(0);
    entity.tokenPrices = new Array<BigInt>(0);
    entity.amounts = new Array<BigInt>(0);
    entity.isLongOrders = new Array<boolean>(0);

    entity.eventName = eventName;
    entity.account = account;
    entity.transaction = transaction.id;
    entity.save();
  }

  return entity as ClaimAction;
}

export function isFundingFeeSettleOrder(order: Order): boolean {
  return (
    order.initialCollateralDeltaAmount.equals(ONE) &&
    order.sizeDeltaUsd.equals(ZERO) &&
    order.orderType == orderTypes.get("MarketDecrease")
  );
}

function createClaimRefIfNotExists(orderId: string): void {
  if (!ClaimRef.load(orderId)) {
    let entity = new ClaimRef(orderId);
    entity.save();
  }
}
