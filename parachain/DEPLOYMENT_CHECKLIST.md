## Quick Setup Checklist

### Before You Deploy with Hardhat

- [ ] **1. Build your parachain**
  ```bash
  pop build --release
  ```

- [ ] **2. Start the network**
  ```bash
  pop up network ./network.toml
  ```
  Note the `eth-rpc-port` from the output (usually 8545)

- [ ] **3. Get your Chain ID**
  Check `runtime/src/configs/mod.rs` or run:
  ```bash
  cast chain-id --rpc-url http://localhost:8545
  ```

- [ ] **4. Configure Hardhat**
  Copy `hardhat.config.example.js` and update:
  - RPC URL (default: http://127.0.0.1:8545)
  - Chain ID (your parachain's EVM chain ID)
  - Deployer account mnemonic

- [ ] **5. Authorize your deployer**
  ```bash
  # Get your EVM address first
  npx hardhat console --network parachain
  > const [deployer] = await ethers.getSigners()
  > deployer.address
  
  # Then authorize it via sudo
  pop call chain \
    --pallet EvmDeploymentControl \
    --function authorize_deployer \
    --args "0xYourAddressHere" \
    --url ws://localhost:9944 \
    --suri //Alice \
    --sudo
  ```

- [ ] **6. Verify authorization**
  ```bash
  # Via Polkadot.js Apps at ws://localhost:9944
  # Developer → Chain State → evmDeploymentControl → authorizedDeployers
  ```

- [ ] **7. Fund your deployer** (if needed)
  ```bash
  # Transfer tokens from //Alice to your deployer address
  # Use Polkadot.js Apps or pop call chain
  ```

- [ ] **8. Deploy!**
  ```bash
  npx hardhat run scripts/deploy.js --network parachain
  ```

### Quick Test

```bash
# Test Ethereum RPC is working
cast block-number --rpc-url http://localhost:8545

# Check if deployer has balance
cast balance 0xYourAddressHere --rpc-url http://localhost:8545
```

See `HARDHAT_DEPLOYMENT_GUIDE.md` for detailed instructions.
