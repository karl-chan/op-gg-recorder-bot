/**
 * This class provides functionality to convert recorded gameplays on op.gg to mp4 videos
 * via jist.tv
 */

function signInJistTV() {

    var jistCredentials = require('../data/jistCredentials.json');
    var username = jistCredentials['username'];
    var password = jistCredentials['password'];

    var url = 'http://www.jist.tv/ajax/jistajax.php';

    casper.thenLazyOpen(url, {
        method: 'post',
        data: {
            'function': 'login',
            'username': username,
            'password': password
        }
    });
}

function getSavedMatches() {
    var url = server + '/select';

    // Force open to get latest copy of saved matches in database
    casper.thenOpen(url, function then() {
        savedMatches = JSON.parse(this.getPageContent());
    });
}

function getRecordedMatches(regionCode, userName, getAll) {

    var url = 'http://' + regionCode + '.op.gg/summoner/userName=' + userName;

    casper.thenLazyOpen(url);

    // Expand page (i.e. press on show more button) to reveal all games
    if (getAll) {
        casper.then(function _revealAllGames() {
            this.waitWhileSelector('.GameMoreButton>a[disabled="disabled"]',
                function then() {
                    if (this.exists('.GameMoreButton')) {
                        this.click('.GameMoreButton>a');
                        this.log('Clicked on "Show More" button for more game records', 'info');
                        this.then(_revealAllGames);
                    }
                },
                function onTimeout() {
                    this.log('Timed out to "Show More" games for: ' + userName, 'error');
                },
                timeout);
        });

        casper.then(function() {
            this.log('Revealed all games for: ' + userName, 'info');
        })
    }

    // Pass in global variable recordedMatches by reference to inner evaluate function
    casper.then(function() {
        recordedMatches = this.evaluate(function(userName) {
            return Array.prototype.slice.call(document.querySelectorAll('.GameItemWrap'))
                .filter(function(gameRecord) {
                    // Extract only games that has been recorded (and not remake)
                    var isRecorded = gameRecord.querySelector('.Button.Replay') != null;
                    var isRemake = gameRecord.querySelector('.GameResult').textContent.trim() == 'Remake';
                    return isRecorded && !isRemake;
                })
                .map(function(gameRecord) {
                    var matchId = parseInt(gameRecord.querySelector('.Button.Replay')
                        .getAttribute('onclick').match(/\d+/)[0]);
                    var gameResult = gameRecord.querySelector('.GameResult').textContent.trim(); //  Victory, Defeat
                    var gameType = gameRecord.querySelector('.GameType').textContent.trim(); // Ranked, Normal etc.
                    var champion = gameRecord.querySelector('.ChampionName').textContent.trim(); // Teemo etc.
                    var ckRate = parseInt(gameRecord.querySelector('.CKRate').textContent.match(/\d+/)[0]);
                    var kill = parseInt(gameRecord.querySelector('.Kill').textContent.trim());
                    var death = parseInt(gameRecord.querySelector('.Death').textContent.trim());
                    var assist = parseInt(gameRecord.querySelector('.Assist').textContent.trim());
                    var level = parseInt(gameRecord.querySelector('.Level').textContent.match(/\d+/)[0]);
                    var timestamp = parseInt(gameRecord.querySelector('.TimeStamp>span').getAttribute('data-datetime'));
                    var summoners = Array.prototype.slice.call(gameRecord.querySelectorAll('.SummonerName'))
                        .map(function(e) {
                            var user = e.textContent.trim();
                            return user;
                        });

                    var multiKillPresent = gameRecord.querySelector('.MultiKill');

                    var matchRecord = {
                        'matchId': matchId,
                        'gameResult': gameResult,
                        'gameType': gameType,
                        'champion': champion,
                        'killParticipation': ckRate,
                        'kill': kill,
                        'death': death,
                        'assist': assist,
                        'level': level,
                        'timestamp': timestamp,
                        'summoner': userName,
                        'summoners': summoners
                    };

                    if (multiKillPresent != null) {
                        matchRecord['multiKill'] = multiKillPresent.textContent.trim();
                    }

                    return matchRecord;
                });
        }, userName);
    });

    // Update lane with data from riot API
    casper.then(function _updateLanes() {

        var riotCredentials = require('../data/riotCredentials.json');
        var apiKey = riotCredentials['api_key'];

        var url_id = 'https://' + regionCode + '.api.pvp.net/api/lol/na/v1.4/summoner/by-name/' + userName + '?api_key=' + apiKey;
                
        casper.thenLazyOpen(url_id, function _getSummonerId() {
        	var content = casper.getPageContent(); //Page Content must be out of evaluate
            casper.evaluate(function() { //Browser Console comands (evaluate)
                var summonerJson = JSON.parse(content);
                var summonerName = Object.keys(summonerJson)[0];
                var summonerId = summonerJson[summonerName]['id']
            });
            
            var lanesLookupMap = {};

            // create lookup map
            var url_lanes = 'https://' + regionCode + '.api.pvp.net/api/lol/na/v2.2/matchlist/by-summoner/' + summonerId  + '?api_key=' + apiKey;
            casper.thenLazyOpen(url_lanes, function _getLanes() {
                var content = casper.getPageContent(); //Page Content must be out of evaluate
                casper.evaluate(function() { //Browser Console comands (evaluate)
                	JSON.parse(content)['matches'].forEach(function(match) {
                        lanesLookupMap[match['matchId']] = sentenceCase(match['lane']);
                	});
                });
                
                // update roles
                recordedMatches.forEach(function(match, i, arr) {
                    arr[i]['role'] = lanesLookupMap[match['matchId']];
                });
            });
		});
    }

function getMatchIdsFromRecords(records) {
    return records.map(function(r) {
        return 'matchId' in r ? r['matchId'] : '';
    })
}

function getRecordSetDifference(largerRecordSet, smallerRecordSet) {
    var diff = largerRecordSet.filter(function(e) {
        // Accept only if no match of id + summoner combination
        for (var i = 0; i < smallerRecordSet.length; i++) {
            var record = smallerRecordSet[i];
            if (record['matchId'] == e['matchId'] && record['summoner'] == e['summoner']) {
                return false;
            }
        }
        return true;
    });
    return diff;
}


function convertToJistVideo(regionCode, userName, matchRecords) {

    if (matchRecords.length == 0) {
        casper.log('Exiting: No new games to convert.', 'info');
        return;
    }

    var url = 'http://' + regionCode + '.op.gg/summoner/userName=' + userName;

    casper.thenLazyOpen(url);

    matchRecords.forEach(function(matchRecord) {

        var matchId = matchRecord['matchId'];
        var url = 'http://na.op.gg/match/new/id=' + matchId;

        casper.thenLazyOpen(url, function clickCreateVideo() {
            var href = this.getElementsAttribute('body > div > h1 > div > a:nth-child(1)', 'href');
            this.open(encodeURI(href));
        });

        casper.waitForSelector('form#create-opgg-replay', function() {
            var videoTitle = matchId + ' ' + userName;
            this.fillSelectors('form#create-opgg-replay', {
                'input[name="video-title-opgg"]': videoTitle,
                '#player-list-opgg': userName
            });

        }, function onTimeout() {
            this.log('Timed out to wait for jist recorder form');
        }, timeout);

        casper.thenClick('#create-opgg-button');

        casper.waitForSelector('#successfully-uploaded[aria-hidden="false"]', function() {
            appendNewMatchRecords([matchRecord]);
            this.log('Successfully submitted request for game: ' + matchId + ' ' + userName, 'info');
        }, function onTimeout() {
            this.log('Timed out for record request sucess confirmation from jist');
        }, timeout);
    });
}

function sortRecordsAscending(matchRecords, ascending) {
    var copy = matchRecords.slice();
    return copy.sort(function(r1, r2) {
        var comp = r1['timestamp'] - r2['timestamp'];
        return ascending ? comp : -comp;
    });
}

function appendNewMatchRecords(newMatchRecords) {
    if (newMatchRecords.length == 0) {
        casper.log('Exiting: No new games to append.', 'info');
        return;
    }

    var url = server + '/insert';

    casper.thenOpen(url, {
        method: 'post',
        headers: {
           'Content-Type': 'application/json; charset=utf-8'
        },
        data: newMatchRecords
    });
}

function updateJistVideoUrls() {
    var site = 'http://www.jist.tv/index.php';

    // open my album on jist.tv
    casper.thenLazyOpen(site, function _openJistAlbum() {
        this.evaluate(function() {
            var hrefs = Array.prototype.slice.call(document.querySelectorAll('a'));
            var myAlbumHref = hrefs.filter(function(a) {
                return a.textContent.indexOf('My Replays') >= 0;
            })[0];
            myAlbumHref.click();
        });
        this.waitForUrl(/album/);
    });

    // Reduce the number of available slots if some videos are still being processed on jist.tv
    casper.then(function _reduceAvailableSlots() {
        var numProcessing = this.evaluate(function() {
            var videos = Array.prototype.slice.call(document.querySelectorAll('.uk-panel.uk-panel-box.uk-panel-box-primary.vp-glow.rp-hover'));
            return videos.filter(function(video) {
                return video.innerHTML.indexOf("We're working on your video.") >= 0;
            }).length;
        });
        maxUploads = numProcessing >= maxUploads? 0: maxUploads - numProcessing;
    });

    // scrape all youtube urls and update savedMatches
    casper.then(function _scrapeJistVideoUrls() {
        var matchesFromJist = this.evaluate(function() {
            var jists = JSON.parse(document.querySelector('#jists').innerHTML);
            return jists.filter(function(jist) {
                var isReady = jist.status == "ready";

                // Also screen out those with invalid video titles
                try {
                    var videoTitle = jist.name;
                    var jistUrl = jist.sourceURL;

                    var regex = /^(\d+) (.*)$/g;
                    var m = regex.exec(videoTitle);
                    var matchId = parseInt(m[1]);
                    var user = m[2];
                } catch (err) {
                    return false;
                }
                return isReady;
            }).map(function(jist) {
                var videoTitle = jist.name;
                var token = jist.replay.token;

                var regex = /^(\d+) (.*)$/g;
                var m = regex.exec(videoTitle);
                var matchId = parseInt(m[1]);
                var user = m[2];

                return {
                    'matchId': matchId,
                    'summoner': user,
                    'token': token
                }       
            });
        });

        // Update jist url only if no existing record in database
        var savedMatchesWithJist = savedMatches.filter(function(match) {
            return 'jistUrl' in match;
        });
        var recordsToUpdate = getRecordSetDifference(matchesFromJist, savedMatchesWithJist);

        // keep only latest records if duplicated
        var distinctRecords = [];
        recordsToUpdate.forEach(function(match) {
            for (var i = 0; i < distinctRecords.length; i++) {
                var r = distinctRecords[i];
                if (r['matchId'] == match['matchId'] 
                    && r['summoner'] == match['summoner']) {
                    return;
                }
            }
            distinctRecords.push(match);
        });

        // Replace fastplay url with reel url
        var payload = [];
        distinctRecords.forEach(function(match) {
            var token = match['token'];

            var detailsUrl = 'http://www.jist.tv/index.php?r=' + token;
            casper.thenLazyOpen(detailsUrl, function _getReelUrl() {
                var reel = this.evaluate(function() {
                    var jists = JSON.parse(document.querySelector('#jists').innerHTML);
                    for (var i = 0; i < jists.length; i++) {
                        var jist = jists[i];
                        if (jist.generator == 'autohlreels') {
                            return jist;
                        }
                    }
                });
                if (reel && reel.assets.hd_h264) {
                    payload.push({
                        'matchId': match['matchId'],
                        'summoner': match['summoner'],
                        'jistUrl': reel.assets.hd_h264
                    });
                }
            });
        });

        this.then(function _updateJistUrls() {
            if (payload.length == 0) {
                casper.log('Exiting: No new jist urls to update.', 'info');
                return;
            }

            // update url for matching id in savedMatches
            var url = server + '/update';
            this.thenOpen(url, {
                method: 'post',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                data: payload
            });
        });
    });
}

function main(region, user) {
    casper.then(function _getRecordedMatches() {
        /* Save result to global variable recordedMatches */
        getRecordedMatches(region, user, allMode);
    });

    casper.then(function _getRecordSetDifference() {
        newMatchRecords = getRecordSetDifference(recordedMatches, savedMatches);

        // truncate to only first n records (--max param)
        newMatchRecords = sortRecordsAscending(newMatchRecords, true);
        newMatchRecords = newMatchRecords.slice(0, Math.min(maxUploads, newMatchRecords.length));
    });

    casper.then(function _convertToJistVideo() {
        var newMatchRecordsAscending = sortRecordsAscending(newMatchRecords, true)
        convertToJistVideo(region, user, newMatchRecordsAscending);
    });
}

function sentenceCase(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

/* 
    Usage: casperjs op2jist.js <region_code>:<user> [--all] [--max=n]
       --all will scrape all matches from beginning of time
       --max=n will upload at most (earliest) n matches to jist tv at a time
*/
"use strict";
var system = require('system');
var casper = require('casper').create({
    verbose: true,
    logLevel: 'info',
    clientScripts: ['includes/jist.js']
});
casper.userAgent('Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36');

var server = system.env.SERVER; // server address (switch to localhost when debugging)
var timeout = 30000; // 30 seconds
var allMode = casper.cli.has('all'); // scrape all matches from beginning of time if --all is passed to command line
var maxUploads = casper.cli.has('max')? casper.cli.get('max'): Infinity; // set max number of matches to upload to jist.tv
var savedMatches = [];

// Define function to lazily open urls to save time
casper.thenLazyOpen = function thenLazyOpen(location, then) {
    if (this.getCurrentUrl() == location) {
        if (then != undefined) {
            this.then(then);
        }
    } else {
        this.thenOpen(location, then);
    }
};

casper.on('remote.message', function(msg) {
    this.log('Remote message: ' + JSON.stringify(msg), 'info');
})
casper.on('error', function(err) {
    this.log(JSON.stringify(err), 'error');
    this.exit(-1);
});

casper.on('page.error', function(msg, trace) {
    this.log(msg, 'debug');
    this.log(JSON.stringify(trace), 'debug');
});

if (allMode) {
    casper.log('All mode specified, will scrape all matches from beginning of time', 'info');
}
if (maxUploads < Infinity) {
    casper.log('Max uploads specified, will upload only ' + maxUploads + ' matches max', 'info');
}

/* Start of scrape here */
casper.start();

casper.then(function _signInJistTV() {
    signInJistTV();
})

casper.then(function _getSavedMatches() {
    /* Save result to global variable savedMatches */
    getSavedMatches();
})

casper.then(function _updateJistVideoUrls() {
    updateJistVideoUrls();
})

for (var i = 0; i < casper.cli.args.length; i++) {
    var params = casper.cli.get(i).split(':');
    var region = params[0];
    var user = params[1];
    var recordedMatches = [];
    var newMatchRecords = [];
    main(region, user);
}

casper.run();
