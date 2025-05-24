const fs = require("fs");
const sqlite = require("sqlite3");

const MAX_LY_RANGE = 9460000000000000 * 12;

const requiredTables = [
    "dgmAttributeTypes", 
    "dgmAttributeCategories",
    "dgmTypeAttributes", 
    "invGroups", 
    "invCategories", 
    "invTypes",
    "invTraits",
    "invMarketGroups",
    "mapDenormalize",
    "staStations", 
    "mapSolarSystems",
    "mapRegions",
    "mapConstellations",
    "chrFactions",
    "ramActivities",
    "planetSchematics",
    "planetSchematicsTypeMap",
    "eveUnits"
];

if(process.argv.length < 4) {
    console.error("Invalid arguments. Required: <Source File> <Target File>")
    process.exit(1)
    return;
}

const sourceFile = process.argv[2];
const targetFile = process.argv[3];

console.log(sourceFile);
console.log(targetFile);

fs.copyFileSync(sourceFile, targetFile);

const db = new sqlite.Database(targetFile)

sqlite.verbose();

db.all("select name from sqlite_master where type='table'", (err, tables) => {
    if(err) {
        console.error("Error while querying tables: ", err)
        process.exit(1);
        return;
    }

    tables = tables.map((table) => table.name);

    let promises = [];

    for(let table of tables) {
        if(requiredTables.includes(table)) {
            continue;
        }

        promises.push(new Promise((resolve, reject) => {
            db.run("DROP TABLE IF EXISTS " + table, (err, result) => {
                if(err) {
                    console.error("Error while dropping table: ", err)
                    process.exit(1);
                    return;
                }

                resolve();
            });
        }))
    }

    Promise.all(promises).then(async () => {
        await generateSkillRequirementsAttributeMappingTable();
        await generateSolarSystemDistancesTable();
        console.log("Running VACUUM Command.")

        db.run("VACUUM", async (err, result) => {
            if(err) {
                console.error("Error while running VACUUM command: ", err)
                process.exit(1);
                return;
            }

            console.log("Done.")
            process.exit(0);
        });
    });
});

async function generateSkillRequirementsAttributeMappingTable() {
    class AttributeMapEntry {
        constructor(displayAttributeID, requirementAttributeID) {
            this.displayAttributeId = displayAttributeID;
            this.requirementAttributeID = requirementAttributeID;
        }
    }

    console.log("Inserting attribute mappings for skill requirements.");
    await new Promise((res, rej) => {
        db.all("CREATE TABLE dgmSkillRequirementsAttributeMapping (displayAttributeID INTEGER NOT NULL, requirementAttributeID INTEGER NOT NULL, PRIMARY KEY (displayAttributeID, requirementAttributeID))", (err, result) => {
            if(err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });

    let mappings = [
        new AttributeMapEntry(182, 277),
        new AttributeMapEntry(183, 278),
        new AttributeMapEntry(184, 279),
        new AttributeMapEntry(1285, 1286),
        new AttributeMapEntry(1289, 1287),
        new AttributeMapEntry(1290, 1288),
    ];

    for(let mapping of mappings) {
        await new Promise((res, rej) => {
            db.exec(`INSERT INTO dgmSkillRequirementsAttributeMapping(displayAttributeID, requirementAttributeID) VALUES(${mapping.displayAttributeId},${mapping.requirementAttributeID})`, (err, result) => {
                if(err) {
                    rej(err);
                } else {
                    res(result);
                }
            });
        });
    }
}

async function generateSolarSystemDistancesTable() {
    console.log("Generating solar system distances");

    let lowsecSystems = await new Promise((res, rej) => {
        db.all("SELECT * FROM mapSolarSystems AS system WHERE system.security <= 0.4 AND system.regionID != 10000070 AND system.regionID != 10000019 AND system.regionID != 10000004 AND system.regionID != 10000017 AND system.regionID < 11000001 AND system.solarSystemID != 30100000", (err, result) => {
            if(err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });

    let highsecSystems = await new Promise((res, rej) => {
        db.all("SELECT * FROM mapSolarSystems AS system WHERE system.security > 0.4 AND system.regionID != 10000070 AND system.regionID != 10000019 AND system.regionID != 10000004 AND system.regionID != 10000017 AND system.regionID < 11000001", (err, result) => {
            if(err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });

    await new Promise((res, rej) => {
        db.exec("CREATE TABLE mapCapitalJumpDistances (startSystemID INTEGER NOT NULL, destinationSystemID INTEGER NOT NULL, distance FLOAT NOT NULL, PRIMARY KEY (startSystemID, destinationSystemID))", (err, result) => {
            if(err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });

    await new Promise((res, rej) => {
        db.exec("CREATE TABLE mapCapitalHSJumpDistances (startSystemID INTEGER NOT NULL, destinationSystemID INTEGER NOT NULL, distance FLOAT NOT NULL, PRIMARY KEY (startSystemID, destinationSystemID))", (err, result) => {
            if(err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });

    let highsecCounter = 0;
    for(let highsecSystem of highsecSystems) {
        for(let lowsecSystem of lowsecSystems) {
            let dist = distance(highsecSystem, lowsecSystem);
            
            if(dist >= MAX_LY_RANGE) {
                continue;
            }

            await insertDistanceEntry("mapCapitalHSJumpDistances", highsecSystem, lowsecSystem, dist);
            highsecCounter++;
            console.log(`Inserted ${highsecCounter} HS to LS distances.`);
        }
    }

    let lowsecCounter = 0;
    // First: Generate connections between all lowsec/nullsec systems
    for(var i = 0; i < lowsecSystems.length - 1; i++) {
        for(var j = i + 1; j < lowsecSystems.length; j++) {
            let systemA = lowsecSystems[i];
            let systemB = lowsecSystems[j];
            let dist = distance(systemA, systemB);

            if(dist >= MAX_LY_RANGE) {
                continue;
            }

            await insertDistanceEntry("mapCapitalJumpDistances", systemA, systemB, dist)
            lowsecCounter++;
            console.log(`Inserted ${lowsecCounter} LS distances.`);
        }
    }
}

function distance(systemA, systemB) {
    return Math.sqrt(Math.pow(systemB.x - systemA.x, 2) + Math.pow(systemB.y - systemA.y, 2) + Math.pow(systemB.z - systemA.z, 2));
}

async function insertDistanceEntry(table, systemA, systemB, dist) {
    await new Promise((res, rej) => {
        db.exec(`INSERT INTO ${table}(startSystemID, destinationSystemID, distance) VALUES(${systemA.solarSystemID},${systemB.solarSystemID},${dist / 9460000000000000})`, (err, result) => {
            if(err) {
                rej(err);
            } else {
                res(result);
            }
        });
    });
}