export function summarizePortfolio({ portfolio, cash }) {
  const holdingsValue = portfolio.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const grossExposure = portfolio.reduce((sum, item) => sum + Math.abs(item.quantity * item.price), 0);
  const totalEquity = holdingsValue + cash;
  const weights = portfolio.map((item) => ({
    symbol: item.symbol,
    marketValue: item.quantity * item.price,
    weight: totalEquity ? (item.quantity * item.price) / totalEquity : 0
  }));

  return {
    holdingsValue,
    cash,
    grossExposure,
    netExposure: holdingsValue,
    totalEquity,
    weights
  };
}

function findHolding(portfolio, symbol) {
  return portfolio.find((item) => item.symbol === symbol);
}

export function normalizeOrder(order, defaultRationale = "") {
  const symbol = String(order?.symbol ?? "").trim().toUpperCase();
  const side = String(order?.side ?? "").trim().toLowerCase();
  const type = String(order?.type ?? "market").trim().toLowerCase();
  const urgency = String(order?.urgency ?? "medium").trim().toLowerCase();
  const quantity = Math.max(0, Math.floor(Number(order?.quantity ?? 0)));
  const limitPrice = order?.limit_price == null ? null : Number(order.limit_price);
  const pieces = Math.max(1, Math.floor(Number(order?.slice?.pieces ?? 1)));
  const intervalSeconds = Math.max(0, Math.floor(Number(order?.slice?.interval_seconds ?? 0)));

  return {
    symbol,
    side,
    type,
    urgency,
    quantity,
    limit_price: Number.isFinite(limitPrice) ? limitPrice : null,
    slice: {
      pieces,
      interval_seconds: intervalSeconds
    },
    rationale: String(order?.rationale ?? defaultRationale).trim()
  };
}

export function simulateExecution({ portfolio, cash, costs, orders }) {
  const workingPortfolio = portfolio.map((item) => ({ ...item }));
  const trades = [];
  const unfilledOrders = [];
  let workingCash = cash;

  for (const rawOrder of orders ?? []) {
    const order = normalizeOrder(rawOrder);
    if (!order.symbol || !["buy", "sell"].includes(order.side) || order.quantity <= 0) {
      unfilledOrders.push({
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        reason: "invalid_order"
      });
      continue;
    }

    const existingHolding = findHolding(workingPortfolio, order.symbol);
    const quote = existingHolding?.price;
    if (!quote) {
      unfilledOrders.push({
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        reason: "missing_quote"
      });
      continue;
    }

    if (order.side === "sell" && (!existingHolding || existingHolding.quantity <= 0)) {
      unfilledOrders.push({
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        reason: "no_position"
      });
      continue;
    }

    const sliceCount = Math.max(1, order.slice?.pieces ?? 1);
    const sliceQuantity = Math.max(1, Math.floor(order.quantity / sliceCount));
    let anySliceFilled = false;
    for (let index = 0; index < sliceCount; index += 1) {
      const quantity = index === sliceCount - 1
        ? order.quantity - sliceQuantity * index
        : sliceQuantity;
      if (quantity <= 0) {
        continue;
      }

      let holding = findHolding(workingPortfolio, order.symbol);

      const urgencyMultiplier = order.urgency === "high" ? 1.5 : order.urgency === "low" ? 0.75 : 1;
      const slippageBps = costs.slippageBps * urgencyMultiplier * (1 + index * 0.08);

      let fillPrice = quote;
      if (order.type === "market") {
        fillPrice = order.side === "buy"
          ? quote * (1 + slippageBps / 10000)
          : quote * (1 - slippageBps / 10000);
      } else if (order.limit_price != null) {
        if (order.side === "buy" && order.limit_price < quote) {
          unfilledOrders.push({
            symbol: order.symbol,
            side: order.side,
            quantity,
            reason: "limit_below_market"
          });
          continue;
        }
        if (order.side === "sell" && order.limit_price > quote) {
          unfilledOrders.push({
            symbol: order.symbol,
            side: order.side,
            quantity,
            reason: "limit_above_market"
          });
          continue;
        }
        fillPrice = order.limit_price;
      }

      const fee = fillPrice * quantity * (costs.txnCostBps / 10000);
      const slipCost = fillPrice * quantity * Math.abs(slippageBps / 10000);
      const cashDelta = order.side === "buy"
        ? -(fillPrice * quantity + fee)
        : fillPrice * quantity - fee;

      if (order.side === "buy" && workingCash + cashDelta < 0) {
        unfilledOrders.push({
          symbol: order.symbol,
          side: order.side,
          quantity,
          reason: "insufficient_cash"
        });
        continue;
      }

      if (order.side === "sell" && quantity > Math.max(0, holding?.quantity ?? existingHolding?.quantity ?? 0)) {
        unfilledOrders.push({
          symbol: order.symbol,
          side: order.side,
          quantity,
          reason: "insufficient_position"
        });
        continue;
      }

      if (!holding) {
        holding = { symbol: order.symbol, quantity: 0, price: quote };
        workingPortfolio.push(holding);
      }

      holding.quantity += order.side === "buy" ? quantity : -quantity;
      holding.price = quote;
      workingCash += cashDelta;
      anySliceFilled = true;

      trades.push({
        symbol: order.symbol,
        side: order.side,
        quantity,
        fillPrice,
        fee,
        slipCost,
        cashDelta
      });
    }

    if (!anySliceFilled && !unfilledOrders.some((item) => item.symbol === order.symbol && item.side === order.side)) {
      unfilledOrders.push({
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        reason: "not_filled"
      });
    }
  }

  return {
    portfolio: workingPortfolio.filter((item) => item.quantity !== 0),
    cash: workingCash,
    trades,
    unfilledOrders,
    summary: summarizePortfolio({ portfolio: workingPortfolio.filter((item) => item.quantity !== 0), cash: workingCash })
  };
}
