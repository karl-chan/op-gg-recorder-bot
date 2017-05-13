# op-gg-recorder-bot
A bot that records and uploads your League of Legend gameplays.

## Installation
This can run on any server with Node.js, PhantomJS, CasperJS and PostgreSQL installed.

You will also need a Youtube, Jist.tv and Riot API account.

1. Server
   * We recommend a Heroku server.  The **Procfile** is already set up for you so that the server starts up automatically upon deploy.

   * Configure the environmental variable `SERVER` to point to the origin of your hosted server.  (Credits to [Alerand](https://github.com/Alerand))

     ![](https://i.gyazo.com/3843a41b664243d20bd08b93f7452a4c.png)
   
     If you run on a different hosting service, you will need to run `node server/server.js` to start the server.
2. Scheduled tasks
   * If deploying on Heroku, we recommend the Heroku Scheduler.  Otherwise any cron job would do fine.
      * The game recorder
      ```
      casperjs scrape/record.js [region code]:[summoner username]
      ```
      Note that region code is the op.gg region code (e.g. na for North America). You can supply multiple summoners as arguments, e.g. `casperjs scrape/record.js na:user1 euw:user2`.

      * The game converter
      ```
      casperjs scrape/op2jist.js [region code]:[summoner username]
      ```

      * The game uploader
      ```
      node scrape/jist2youtube.js
      ```

      The game recorder has to be run **as often as possible** (ideally no sparser than 10 minutes), as matches are only recorded on op.gg if a request is made within the first 25 minutes of a gameplay.

      The game converter can be run less often, say once per hour, just to bear in mind that Jist.tv currently only supports converting gameplays with the current LoL client version, so outdated games will fail.

      The game uploader can be run at your leisure, whenever you would like to upload converted gameplays to your Youtube account.
3. Accounts and databases
   * Replace the credentials with your own in the `data` folder:
      * `data/googleCredentials.json` 
        Create a project in the Google Developers API console, and obtain a set of `clientId`, `clientSecret`.
        You will also need to obtain a set of `accessToken` and `refreshToken` and grant them access to your Youtube account. 
        This can be done via the [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).  The `redirectUri` can be set to anything, as it is not used.

      * `data/jistCredentials.json`
        Open an account at Jist.tv and replace the fields in the file.

      * `data/psqlCredentials.json`
        Set up a PostgreSQL database, say on your server (Heroku has a free Postgres option for up to 5000 rows), and replace the fields in the file.  You will also need to refer to the "Post deployment" section to set up the necessary tables.

      * `data/riotCredentials.json`
        Open a Riot API account and replace the fields in the file.

4. Post deployment
   * Hit `http://[your server host url]/create` so that the correct tables will be set up in your Postgres database.
