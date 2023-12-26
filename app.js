const express = require("express");
const app = express();
app.use(express.json());
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB error : ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

//API 1:
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectedUserQuery = `
           select * from user 
           where username='${username}';
    `;
  const dbUser = await db.get(selectedUserQuery);

  //If an unregistered user tries to login
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkingPassword = await bcrypt.compare(password, dbUser.password);
    //If the user provides an incorrect password
    if (checkingPassword === false) {
      response.status(400);
      response.send("Invalid password");
    }
    //Successful login of the user
    else {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "jwt_token");
      response.send({ jwtToken });
    }
  }
});

//verify the jwt token
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  //If the token is not provided by the user or an invalid token
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "jwt_token", async (error, payload) => {
      //If the token is not provided by the user or an invalid token
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      }
      //After successful verification of token proceed to next middleware or handler
      else {
        next();
      }
    });
  }
};

//convert State DbObject To ResponseObject
const convertStateDbObjectToResponseObject = (stateObject) => {
  return {
    stateId: stateObject.state_id,
    stateName: stateObject.state_name,
    population: stateObject.population,
  };
};

//API 2: Returns a list of all states in the state table
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
      select * from state;
  `;
  const statesArray = await db.all(getStatesQuery);
  response.send(
    statesArray.map((eachState) =>
      convertStateDbObjectToResponseObject(eachState)
    )
  );
});

//API 3: Returns a state based on the state ID
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
        select * from state
        where state_id=${stateId};
    `;
  const state = await db.get(getStateQuery);
  response.send(convertStateDbObjectToResponseObject(state));
});

//convert district dbObject to responseObject
const convertDistrictDbObjectToResponseObject = (districtObject) => {
  return {
    districtId: districtObject.district_id,
    districtName: districtObject.district_name,
    stateId: districtObject.state_id,
    cases: districtObject.cases,
    cured: districtObject.cured,
    active: districtObject.active,
    deaths: districtObject.deaths,
  };
};

//API 4: Create a district in the district table, `district_id` is auto-incremented
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const addDistrictQuery = `
       insert into district(district_name,state_id,cases,cured,active,deaths)
    values('${districtName}',${stateId},${cases},${cured},${active},${deaths});
  `;
  await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

//API 5: Returns a district based on the district ID
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
        select * from district 
        where district_id=${districtId};
    `;
    const district = await db.get(getDistrictQuery);
    response.send(convertDistrictDbObjectToResponseObject(district));
  }
);

//API 6: Deletes a district from the district table based on the district ID
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
         delete from district
         where district_id=${districtId};
    `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//API 7: Updates the details of a specific district based on the district ID
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrictQuery = `
          update district set
          district_name='${districtName}',
          state_id=${stateId},
          cases=${cases},
          cured=${cured},
          active=${active},
          deaths=${deaths}
          where district_id=${districtId};
    `;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//API 8: Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getTotalDistrictQuery = `
        select sum(cases) as totalCases,
               sum(cured) as totalCured,
               sum(active) as totalActive,
               sum(deaths) as totalDeaths
        from district natural join state 
        where state_id=${stateId};
    `;
    const getTotal = await db.get(getTotalDistrictQuery);
    response.send(getTotal);
  }
);

module.exports = app;
