const hre = require("hardhat");
const fs = require("fs");
require("dotenv").config();

let config, arb, owner, inTrade, balances;
const network = hre.network.name;
config = require(`./../config/${network}.json`);

console.log(`Loaded ${config.routes.length} routes`);
console.log(`Loaded ${config.baseAssets.length} baseAssets`);
console.log(`Loaded ${config.tokens.length} tokens`);
console.log(`Loaded ${config.routers.length} routers`);

const DEFAULT_DIV_SIZE = 1

const main = async () => {
  console.log("start setup.... block at", await hre.ethers.provider.getBlockNumber())
  await setup();
  // Scale when using own node
  //[0,0,0,0,0,0,0,0,0].forEach(async (v,i) => {
  //  await new Promise(r => setTimeout(r, i*1000));
  //  await lookForDualTrade();
  //});
  while (true) {
    await lookForDualTrade();
    await lookForTriTrade();
  }

}

const searchForRoutes = (tri = false) => {
  const targetRoute = {};
  if (tri) {
    targetRoute.router1 = config.routers[Math.floor(Math.random() * config.routers.length)].address;
    targetRoute.router2 = config.routers[Math.floor(Math.random() * config.routers.length)].address;
    targetRoute.router3 = config.routers[Math.floor(Math.random() * config.routers.length)].address;
    targetRoute.token1 = config.baseAssets[Math.floor(Math.random() * config.baseAssets.length)].address;
    targetRoute.token2 = config.tokens[Math.floor(Math.random() * config.tokens.length)].address;
    targetRoute.token3 = config.tokens[Math.floor(Math.random() * config.tokens.length)].address;
  } else {

    targetRoute.router1 = config.routers[Math.floor(Math.random() * config.routers.length)].address;
    targetRoute.router2 = config.routers[Math.floor(Math.random() * config.routers.length)].address;
    targetRoute.token1 = config.baseAssets[Math.floor(Math.random() * config.baseAssets.length)].address;
    targetRoute.token2 = config.tokens[Math.floor(Math.random() * config.tokens.length)].address;
  }
  return targetRoute;
}

let goodCount = 0;
const useGoodRoutes = () => {
  const targetRoute = {};
  const route = config.routes[goodCount];
  goodCount += 1;
  if (goodCount >= config.routes.length) goodCount = 0;
  targetRoute.router1 = route[0];
  targetRoute.router2 = route[1];
  targetRoute.token1 = route[2];
  targetRoute.token2 = route[3];
  return targetRoute;
}

const lookForDualTrade = async () => {
  console.log('==================LOOK FOR DUAL TRADE===================')
  let targetRoute;
  if (config.routes.length > 0) {
    targetRoute = useGoodRoutes();
  } else {
    targetRoute = searchForRoutes();
  }
  let tradeSize = balances[targetRoute.token1].balance.div(DEFAULT_DIV_SIZE);
  try {
    const amtBack = await arb.estimateDualDexTrade(targetRoute.router1, targetRoute.router2, targetRoute.token1, targetRoute.token2, tradeSize);
    const multiplier = hre.ethers.BigNumber.from(config.minBasisPointsPerTrade + 10000);
    const sizeMultiplied = tradeSize.mul(multiplier);
    const divider = hre.ethers.BigNumber.from(10000);
    const profitTarget = sizeMultiplied.div(divider);

    if (!config.routes.length > 0) {
      fs.appendFile(`./data/${network}RouteLog.txt`, `["${targetRoute.router1}","${targetRoute.router2}","${targetRoute.token1}","${targetRoute.token2}"],` + "\n", function (err) { });
    }
    if (amtBack.gt(profitTarget)) {
      console.log('YES tradable route found', {
        tradeSize, targetRoute, amtBack,
        sizeMultiplied,
        profitTarget,
        diff: amtBack / profitTarget
      })

      await dualTrade(targetRoute.router1, targetRoute.router2, targetRoute.token1, targetRoute.token2, tradeSize);
    } else {
      // await lookForDualTrade();
      console.log('NO tradable route found', {
        tradeSize, targetRoute, amtBack,
        sizeMultiplied,
        profitTarget,
        diff: amtBack / profitTarget
      })

    }
  } catch (e) {
    let msg = ""
    if (e.message.includes("missing revert data in call exception")) {
      msg = "reverted"
    } else {
      msg = e.message
    }

    console.error('NO tradable route found', {
      tradeSize, targetRoute,
      err: msg
    })
  }
  // await lookForDualTrade();

  console.log(`payload: ("${targetRoute.router1}", "${targetRoute.router2}", "${targetRoute.token1}", "${targetRoute.token2}", "${tradeSize}")`)

}

const lookForTriTrade = async () => {
  console.log('==================LOOK FOR TRI TRADE===================')
  let targetRoute;
  if (config.routes.length > 0) {
    targetRoute = useGoodRoutes();
  } else {
    targetRoute = searchForRoutes(true);
  }
  let tradeSize = balances[targetRoute.token1].balance.div(DEFAULT_DIV_SIZE);
  try {
    // console.log(`("${targetRoute.router1}", "${targetRoute.router2}", "${targetRoute.router3}", "${targetRoute.token1}", "${targetRoute.token2}", "${targetRoute.token3}", "${tradeSize}")`)
    const amtBack = await arb.estimateTriDexTrade(targetRoute.router1, targetRoute.router2, targetRoute.router3, targetRoute.token1, targetRoute.token2, targetRoute.token3, tradeSize);
    const multiplier = hre.ethers.BigNumber.from(config.minBasisPointsPerTrade + 10000);
    const sizeMultiplied = tradeSize.mul(multiplier);
    const divider = hre.ethers.BigNumber.from(10000);
    const profitTarget = sizeMultiplied.div(divider);

    if (!config.routes.length > 0) {
      fs.appendFile(`./data/${network}RouteLog_Tri.txt`, `["${targetRoute.router1}","${targetRoute.router2}","${targetRoute.router3}", "${targetRoute.token1}","${targetRoute.token2}", "${targetRoute.token3}"],` + "\n", function (err) { });
    }
    if (amtBack.gt(profitTarget)) {
      console.log('YES tri tradable route found', {
        tradeSize, targetRoute, amtBack,
        sizeMultiplied,
        profitTarget,
        diff: amtBack / profitTarget
      })
      await triTrade(targetRoute.router1, targetRoute.router2, targetRoute.router3, targetRoute.token1, targetRoute.token2, targetRoute.token3, tradeSize);
    } else {
      // await lookForTriTrade();
      console.log('NO tri tradable route found', {
        tradeSize, targetRoute, amtBack,
        sizeMultiplied,
        profitTarget,
        diff: amtBack / profitTarget
      })
    }
  } catch (e) {
    let msg = ""
    if (e.message.includes("missing revert data in call exception")) {
      msg = "reverted"
    } else {
      msg = e.message
    }

    console.error('NO tradable route found', {
      tradeSize, targetRoute,
      err: msg
    })

  }
  // await lookForTriTrade();
  console.log(`payload: ("${targetRoute.router1}", "${targetRoute.router2}", "${targetRoute.router3}", "${targetRoute.token1}", "${targetRoute.token2}", "${targetRoute.token3}", "${tradeSize}")`)

}

const dualTrade = async (router1, router2, baseToken, token2, amount) => {
  if (inTrade === true) {
    // await lookForDualTrade();
    return false;
  }
  try {
    inTrade = true;
    console.log('> Making dualTrade...');
    const tx = await arb.connect(owner).dualDexTrade(router1, router2, baseToken, token2, amount); //{ gasPrice: 1000000000003, gasLimit: 500000 }
    await tx.wait();
    inTrade = false;
    // await lookForDualTrade();
    return true
  } catch (e) {
    console.log(e);
    inTrade = false;
    // await lookForDualTrade();
    return false
  }
}

const triTrade = async (router1, router2, router3, baseToken, token2, token3, amount) => {
  if (inTrade === true) {
    // await lookForTriTrade();
    return false;
  }
  try {
    inTrade = true;
    console.log('> Making triTrade...');
    const tx = await arb.connect(owner).triDexTrade(router1, router2, router3, baseToken, token2, token3, amount); //{ gasPrice: 1000000000003, gasLimit: 500000 }
    await tx.wait();
    inTrade = false;
    // await lookForTriTrade();
    return true
  } catch (e) {
    console.log(e);
    inTrade = false;
    // await lookForTriTrade();
    return false
  }
}

const setup = async () => {
  [owner] = await hre.ethers.getSigners();
  const IArb = await hre.ethers.getContractFactory('Arb');
  arb = await IArb.attach(config.arbContract);
  balances = {};
  console.log(`Owner: ${owner.address}`);
  console.log("ARB contract address: ", arb.address)

  for (let i = 0; i < config.baseAssets.length; i++) {
    const asset = config.baseAssets[i];
    const interface = await hre.ethers.getContractFactory('WETH9');
    const assetToken = interface.attach(asset.address);
    const balance = await assetToken.balanceOf(config.arbContract);
    balances[asset.address] = { sym: asset.sym, balance, startBalance: balance };
  }

  console.log({ balances })
  setTimeout(() => {
    setInterval(() => {
      logResults();
    }, 600000);
    logResults();
  }, 120000);
}

const logResults = async () => {
  console.log(`############# LOGS #############`);
  for (let i = 0; i < config.baseAssets.length; i++) {
    const asset = config.baseAssets[i];
    const interface = await hre.ethers.getContractFactory('WETH9');
    const assetToken = await interface.attach(asset.address);
    balances[asset.address].balance = await assetToken.balanceOf(config.arbContract);
    const diff = balances[asset.address].balance.sub(balances[asset.address].startBalance);
    const basisPoints = diff.mul(10000).div(balances[asset.address].startBalance);
    console.log(`#  ${asset.sym}: ${basisPoints.toString()}bps`);
  }
}

process.on('uncaughtException', function (err) {
  console.log('UnCaught Exception 83: ' + err);
  console.error(err.stack);
  fs.appendFile('./critical.txt', err.stack, function () { });
});

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: ' + p + ' - reason: ' + reason);
});

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
