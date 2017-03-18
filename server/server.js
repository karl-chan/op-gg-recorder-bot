"use strict";

var bodyParser = require('body-parser');
var express = require('express');
var path = require('path');
var app = express();

app.set('port', (process.env.PORT || 80));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var async = require('async');
var pg = require('pg');
var psqlCredentials = require('../data/psqlCredentials.json');
var config = {
    host: psqlCredentials['host'],
    database: psqlCredentials['dbname'],
    port: psqlCredentials['port'],
    user: psqlCredentials['user'],
    password: psqlCredentials['password'],
    max: 10,
    idleTimeoutMillis: 30000,
    ssl: true,
    charset  : 'utf8'
}
var pool = new pg.Pool(config)

pool.on('error', function (err, client) {
    console.error('idle client error', err.message, err.stack);
})

var rollback = function(client, done) {
    client.query('ROLLBACK', function(err) {
        if (err) {console.error(err); done(); res.status(500).send(); return;}
        return done(err);
    });
};

app.get('/create', function(req, res) {
    console.log('Received create table request');
    pool.connect(function(err, client, done) {
        if (err) {console.error(err); done(); res.status(500).send(); return;}
        client.query('BEGIN', function(err) {
            if(err) return rollback(client, done);
            client.query('CREATE TABLE IF NOT EXISTS "match_records" ('
            + '"match_id" BIGINT NOT NULL, ' 
            + '"game_result" VARCHAR(255) NOT NULL, '
            + '"game_type" VARCHAR(255) NOT NULL, '
            + '"champion" VARCHAR(255) NOT NULL, ' 
            + '"kill_participation" INTEGER NOT NULL, ' 
            + '"kill" INTEGER NOT NULL, ' 
            + '"death" INTEGER NOT NULL, ' 
            + '"assist" INTEGER NOT NULL, ' 
            + '"level" INTEGER NOT NULL, ' 
            + '"timestamp" TIMESTAMP NOT NULL, ' 
            + '"summoner" VARCHAR(255) NOT NULL, ' 
            + '"summoners" VARCHAR(255) ARRAY NOT NULL, ' 
            + '"multi_kill" VARCHAR(255) NULL, ' 
            + '"role" VARCHAR(255) NULL, '
            + '"jist_url" VARCHAR(255) NULL, '
            + '"youtube_url" VARCHAR(255) NULL, '
            + 'PRIMARY KEY ("match_id", "summoner"))', 
            function(err) {
                if (err) return rollback(client, done);
                client.query('CREATE INDEX IF NOT EXISTS "summoner_idx" ON "match_records" '
                    + '("summoner", "timestamp")', function(err) {
                        if (err) return rollback(client, done);
                        client.query('COMMIT', function(err) {                                
                            done();
                            console.log('Successfully created table.');
                            res.send('Successfully created table.');
                        });
                    });
            });
        });
    });     
});

/*
    Returns all entries in database, ordered in descending order of match id
*/
app.get('/select', function(req, res) {
    // console.log('Received select request: ' + JSON.stringify(req.query));

    // Handle special request with where clause
    var where = ('where' in req.query)? 'WHERE ' + req.query['where'] + ' ': ' ';

    // Execute select statement
    pool.connect(function(err, client, done) {
        if (err) {console.error(err); done(); res.status(500).send(); return;}
        client.query('SELECT "match_id", "game_result", "game_type", "champion", "kill_participation", '
            + '"kill", "death", "assist", "level", EXTRACT(epoch FROM "timestamp") AS "timestamp", '
            + '"summoner", "summoners", "multi_kill", "role", "jist_url", "youtube_url" '
            + 'FROM "match_records" '
            + where
            + 'ORDER BY "match_id" DESC', 
            function(err, result) {
                if (err) {console.error(err); done(); res.status(500).send(); return;}
                console.log('Successfully retrieved: ' + result['rowCount'] + ' records');
                var json = result.rows.map(function(row) {

                    var match = {
                        'matchId': row['match_id'],
                        'gameResult': row['game_result'],
                        'gameType': row['game_type'],
                        'champion': row['champion'],
                        'killParticipation': row['kill_participation'],
                        'kill': row['kill'],
                        'death': row['death'],
                        'assist': row['assist'],
                        'level': row['level'],
                        'timestamp': row['timestamp'],
                        'summoner': row['summoner'],
                        'summoners': row['summoners']
                    };
                    if (row['multi_kill']) {
                        match['multiKill'] = row['multi_kill'];
                    }
                    if (row['role']) {
                        match['role'] = row['role'];
                    }
                    if (row['jist_url']) {
                        match['jistUrl'] = row['jist_url'];
                    }
                    if (row['youtube_url']) {
                        match['youtubeUrl'] = row['youtube_url'];
                    }
                    return match;
                });
                done();
                res.charset = 'utf8';
                res.json(json);
            });
    });    
});

/*
    Request should be a json array of matches to insert
    [{
        'matchId': matchId,
        'gameResult': gameResult,
        'gameType': gameType,
        'champion': champion,
        'killParticipation': killParticipation,
        'kill': kill,
        'death': death,
        'assist': assist,
        'level': level,
        'timestamp': timestamp,
        'summoner': summoner,
        'summoners': summoners,
        'multiKill': multiKill,
        'role': role,
        'jist_url': jistUrl,
        'youtube_url': youtubeUrl
    },
    ...]
*/
app.post('/insert', function(req, res) {
    // console.log('Received insert request: ' + JSON.stringify(req.body));
    var sqlParam = req.body.map(function(match) {
        var matchId = match['matchId'];
        var gameResult = "'" + match['gameResult'] + "'";
        var gameType = "'" + match['gameType'] + "'";
        var champion = "'" + match['champion'].replace(/'/g, "''") + "'"; // need to escape ' for champions e.g. Cho'Gath
        var killParticipation = match['killParticipation'];
        var kill = match['kill'];
        var death = match['death'];
        var assist = match['assist'];
        var level = match['level'];
        var timestamp = 'to_timestamp(' + match['timestamp'] + ')';
        var summoner = "'" + match['summoner'] + "'";
        var summoners = 'ARRAY' + JSON.stringify(match['summoners']).replace(/"/g, "'");
        var multiKill = ('multiKill' in match)? "'" + match['multiKill'] + "'": 'NULL';
        var role = ('role' in match)? "'" + match['role'] + "'": 'NULL';
        var jistUrl = ('jistUrl' in match)? "'" + match['jistUrl'] + "'": 'NULL';
        var youtubeUrl = ('youtubeUrl' in match)? "'" + match['youtubeUrl'] + "'": 'NULL';
        return '(' + [matchId, gameResult, gameType, champion, killParticipation, kill, death, assist, level, timestamp, summoner, summoners, multiKill, role, jistUrl, youtubeUrl].join(',') + ")";
    }).join(',');

    // Execute insert statement
    pool.connect(function(err, client, done) {
        if (err) {console.error(err); done(); res.status(500).send(); return;}
        /*console.log('INSERT INTO "match_records" '
            + '(match_id, game_result, game_type, champion, kill_participation, kill, death, assist, level, timestamp, summoner, summoners, multi_kill, role, jist_url, youtube_url) '
            + 'VALUES '
            + sqlParam);*/
        client.query('INSERT INTO "match_records" '
            + '(match_id, game_result, game_type, champion, kill_participation, kill, death, assist, level, timestamp, summoner, summoners, multi_kill, role, jist_url, youtube_url) '
            + 'VALUES '
            + sqlParam,
            function(err, result) {
                if (err) {console.error(err); done(); res.status(500).send(); return;}
                done();
                console.log('Successfully inserted: ' + result['rowCount'] + ' records');
                res.send('Successfully inserted: ' + result['rowCount'] + ' records');
            });
    });    
});

/*
    Request should be a json array of matches to update (based on matchId and summoner combination)
    [{
        'matchId': matchId,
        'gameResult': gameResult,
        'gameType': gameType,
        'champion': champion,
        'killParticipation': killParticipation,
        'kill': kill,
        'death': death,
        'assist': assist,
        'level': level,
        'timestamp': timestamp,
        'summoner': summoner,
        'summoners': summoners,
        'multiKill': multiKill,
        'role': role,
        'jist_url': jistUrl,
        'youtube_url': youtubeUrl
    },
    ...]
*/
app.post('/update', function(req, res) {
    // console.log('Received update request: ' + JSON.stringify(req.body));
    /* Find out which columns should be set */
    var shouldSetList = [];
    if ('gameResult' in req.body[0]) {
        shouldSetList.push('"game_result" = t."game_result"');
    }
    if ('gameType' in req.body[0]) {
        shouldSetList.push('"game_type" = t."game_type"');
    }
    if ('"champion"' in req.body[0]) {
        shouldSetList.push('"champion" = t."champion"');
    }
    if ('killParticipation' in req.body[0]) {
        shouldSetList.push('"kill_participation" = t."kill_participation"');
    }
    if ('kill"' in req.body[0]) {
        shouldSetList.push('"kill" = t."kill"');
    }
    if ('death' in req.body[0]) {
        shouldSetList.push('"death" = t."death"');
    }
    if ('assist' in req.body[0]) {
        shouldSetList.push('"assist" = t."assist"');
    }
    if ('level' in req.body[0]) {
        shouldSetList.push('"level" = t."level"');
    }
    if ('timestamp' in req.body[0]) {
        shouldSetList.push('"timestamp" = t."timestamp"');
    }
    if ('summoners' in req.body[0]) {
        shouldSetList.push('"summoners" = t."summoners"');
    }
    if ('multiKill' in req.body[0]) {
        shouldSetList.push('"multi_kill" = t."multi_kill"');
    }
    if ('role' in req.body[0]) {
        shouldSetList.push('"role" = t."role"');
    }
    if ('jistUrl' in req.body[0]) {
        shouldSetList.push('"jist_url" = t."jist_url"');
    }
    if ('youtubeUrl' in req.body[0]) {
        shouldSetList.push('"youtube_url" = t."youtube_url"');
    }

    var sqlParam = req.body.map(function(match) {
        var matchId = match['matchId'];
        var gameResult = "'" + match['gameResult'] + "'";
        var gameType = "'" + match['gameType'] + "'";
        var champion = ('champion' in match)? "'" + match['champion'].replace(/'/g, "''") + "'": 'NULL'; // need to escape ' for champions e.g. Cho'Gath
        var killParticipation = ('killParticipation' in match)? match['killParticipation']: 0;
        var kill = ('kill' in match)? match['kill']: 0;
        var death = ('death' in match)? match['death']: 0;
        var assist = ('assist' in match)? match['assist']: 0;
        var level = ('level' in match)? match['level']: 0;
        var timestamp = ('timestamp' in match)? 'to_timestamp(' + match['timestamp'] + ')': 0;
        var summoner = ('summoner' in match)? "'" + match['summoner'] + "'": 'NULL';
        var summoners = ('summoners' in match)? 'ARRAY' + JSON.stringify(match['summoners']).replace(/"/g, "'"): 'NULL';
        var multiKill = ('multiKill' in match)? "'" + match['multiKill'] + "'": 'NULL';
        var role = ('role' in match)? "'" + match['role'] + "'": 'NULL';
        var jistUrl = ('jistUrl' in match)? "'" + match['jistUrl'] + "'": 'NULL';
        var youtubeUrl = ('youtubeUrl' in match)? "'" + match['youtubeUrl'] + "'": 'NULL';
        return '(' + [matchId, gameResult, gameType, champion, killParticipation, kill, death, assist, level, timestamp, summoner, summoners, multiKill, role, jistUrl, youtubeUrl].join(',') + ")";
    });

    // Split large request into chunks of size 10
    var batch = [], size = 10;
    while (sqlParam.length > 0) {
        batch.push(sqlParam.splice(0, size));
    }
    var updatedRowCounts = 0;
    async.each(batch, function(param, callback) {
        var sql = param.join(',');

        // Execute update statement
        pool.connect(function(err, client, done) {
            if (err) {console.error(err); done(); res.status(500).send(); return;}
            // console.log('UPDATE "match_records" AS mr SET '
            //     + shouldSetList.join(',')
            //     + ' FROM (VALUES '
            //     + param
            //     + ') AS t(match_id, game_result, game_type, champion, kill_participation, kill, death, assist, level, timestamp, summoner, summoners, multi_kill, role, jist_url, youtube_url) '
            //     + ' WHERE t."match_id" = mr."match_id" AND t."summoner" = mr."summoner"');
            client.query('UPDATE "match_records" AS mr SET '
                + shouldSetList.join(',')
                + ' FROM (VALUES '
                + param
                + ') AS t(match_id, game_result, game_type, champion, kill_participation, kill, death, assist, level, timestamp, summoner, summoners, multi_kill, role, jist_url, youtube_url) '
                + ' WHERE t."match_id" = mr."match_id" AND t."summoner" = mr."summoner"',
                function(err, result) {
                    console.log('Successfully updated: ' + result['rowCount'] + ' records');
                    updatedRowCounts += result['rowCount'];
                    done();
                    callback();
                });
        });    
    }, function(err) {
        if (err) {console.error(err); done(); res.status(500).send(); return;}
        res.send('Successfully updated: ' + updatedRowCounts + ' records');
    });    
});

/*
    Dashboard for display / modification of database entries
*/
app.get('/dashboard', function(req, res) {
    if ('sql' in req.query) {
        var sql = req.query.sql;

        // Execute sql statement
        pool.connect(function(err, client, done) {
            if (err) {console.error(err); done(); res.status(500).send(); return;}
            client.query(sql, function(err, result) {          
                done();
                if (err) {
                    res.render('dashboard', {
                        sqlSuccessful: false,
                        sqlFailure: true,
                        sql: sql,
                        error: String(err)
                    });
                } else {
                    res.render('dashboard', {
                        sqlSuccessful: true,
                        sqlFailure: false,
                        sql: sql,
                        data: result.rows,
                        count: result.rowCount
                    });
                }
            });
        });    
    } else {
        res.render('dashboard');
    }
});


app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});