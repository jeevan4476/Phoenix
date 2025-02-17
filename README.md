# PHOENIX

A fully automated trading bot designed to execute trades based on predefined strategies. This bot interacts with financial markets, analyzing data and executing trades efficiently.

## Features

- Automated trade execution
- Strategy-based trading
- Real-time market data analysis
- Exchange API integration
- Configurable risk management

## Tech Stack

- *Language:* TypeScript
- *Backend:* Node.js
- *Package Manager:* pnpm
- *APIs:* Coinbase

## Getting Started

### Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

### Installation

Clone the repository and install dependencies:

```bash
pnpm install
```

### Configuration

Create a .env file in the project root and add the required environment variables:


PRIVATE_KEY=<your_private_key>



### Running the Bot

Start the bot with:

```bash
pnpm start
```


## Usage

1. Configure your trading strategy in the settings.
2. Run the bot and monitor trades.
3. Adjust risk parameters as needed.
4. Use at your own risks.

## Contributing

Pull requests are welcome! Please follow best practices and create an issue before submitting major changes.

##Future work
Calculate volatility of the market price and implement logic to have dynamic EDGE depending on volatility
Calculate dynamic bid and ask order quantities (order sizes)
Calculate and track profitability of the strategy
Place multiple bid-ask order pairs with different order sizes to experiment with profitability
Build advanced strategies and experiment with different types of self-trade behaviours
## License

MIT License
