# Railroad Tycoon FHE: A Private Cargo Market Simulation Game 🚂💼

Railroad Tycoon FHE is an innovative railroad management simulation game that leverages **Zama's Fully Homomorphic Encryption (FHE) technology**. Players engage in strategic planning to meet the encrypted cargo demands of various cities, establish rail networks, and uncover lucrative market opportunities while maintaining privacy.

## The Problem Addressed

In the traditional gaming landscape, player data and in-game economic models often lack confidentiality, exposing sensitive information and diminishing user trust. In a market simulation game, where information is power, players face challenges like predictable gameplay and a lack of competitive advantage due to visible market data. 

## The FHE Solution

This project addresses these concerns by incorporating **Zama's FHE technology**. Through the use of Zama's open-source libraries, such as **Concrete** and the **zama-fhe SDK**, Railroad Tycoon FHE enables encrypted computation of market demands and profitability calculations. This ensures that while players strive to optimize their strategies, their data and competitive tactics remain confidential and secure.

## Core Features

- **Encrypted Market Dynamics**: All cargo market supply and demand data is encrypted using FHE, making it inaccessible yet functional in-game.
- **Profit Calculation**: The game performs homomorphic calculations on player profits without revealing actual values, ensuring privacy.
- **Market Information Discovery**: Simulates the competitive nature of market exploration, allowing players to discover profitable opportunities while remaining confidential.
- **Enhanced Realism**: By integrating encrypted data, the game provides a realistic and challenging business operation experience.

## Technology Stack

- **Zama's Fully Homomorphic Encryption SDK**: Utilizing libraries like **Concrete**, **TFHE-rs**, and **zama-fhe SDK** for secure, confidential computing.
- **Node.js**: For building and running the back-end services.
- **Hardhat/Foundry**: For smart contract development and testing.

## Directory Structure

```plaintext
Railroad_FHE/
├── contracts/
│   └── Railroad_FHE.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── Railroad_FHE_test.js
├── README.md
├── package.json
└── hardhat.config.js
```

## Installation Guide

To set up the Railroad Tycoon FHE project, follow the instructions below:

1. Ensure you have **Node.js** installed. If not, please download it from the official Node.js website.

2. Navigate to the project directory.

3. Run the following command to install the required dependencies, including the Zama FHE libraries:

   ```bash
   npm install
   ```

> **Note**: Do not use `git clone` or any repository URLs. Ensure you manually download the project files.

## Build & Run Guide

After successfully installing the dependencies, you can build and run the project by executing the following commands:

1. **Compile the smart contracts**:

   ```bash
   npx hardhat compile
   ```

2. **Run the tests** to ensure everything is functioning as expected:

   ```bash
   npx hardhat test
   ```

3. **Deploy the smart contracts** on your desired network:

   ```bash
   npx hardhat run scripts/deploy.js --network <network_name>
   ```

> Replace `<network_name>` with the specific network you are deploying on, such as `localhost` or `rinkeby`.

## Code Example

Here’s a snippet to demonstrate how to calculate profits using Zama's FHE within the game:

```javascript
const Concrete = require('zama-fhe-sdk');

async function calculateEncryptedProfit(revenueEncrypted, costEncrypted) {
    const client = new Concrete.Client();

    // Perform homomorphic subtraction on encrypted values
    const profitEncrypted = await client.subtract(revenueEncrypted, costEncrypted);
    
    return profitEncrypted;
}

// Example usage
const revenue = /* some encrypted revenue */;
const cost = /* some encrypted cost */;
const profit = calculateEncryptedProfit(revenue, cost);
```

This code snippet illustrates how players can securely calculate their profits without exposing any underlying data to others, ensuring the confidentiality of their operational strategies.

## Acknowledgements

### Powered by Zama

A heartfelt thank you to the Zama team for their groundbreaking work in the field of fully homomorphic encryption. Their pioneering efforts and open-source tools make it possible to build confidential, innovative blockchain applications like Railroad Tycoon FHE.
