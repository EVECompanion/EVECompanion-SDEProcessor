# EVECompanion SDE Processor

## About

This project contains the script to process the [Fuzzwork SQLite SDE conversion](https://www.fuzzwork.co.uk/dump/) for use in the [EVECompanion iOS App](https://github.com/EVECompanion/EVECompanion).

## Requirements

- Node.js 23

## Usage

1. Install the dependencies by running `npm install`
2. Download Fuzzwork's SQLite conversion from https://www.fuzzwork.co.uk/dump/
3. Run the script `node index.js <path to input file> <path to output file>` (e.g. `node index.js sqlite-latest.sqlite EVE.sqlite`)

> [!CAUTION]  
> This will overwrite the file at the output path.

4. Wait for the script to finish. Generating the jump distances table will take a while.