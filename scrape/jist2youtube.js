"use strict";

var server = process.env.SERVER;;

var googleCredentials = require('../data/googleCredentials.json');

var program = require('commander');
var async = require('async');
var os = require('os');
var fs = require('fs');
var path = require('path');
var request = require('request');
var ytdl = require('ytdl-core');
var gmdate = require('phpdate-js').gmdate;
var google = require('googleapis');
var youtube = google.youtube('v3');
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(googleCredentials['clientId'], googleCredentials['clientSecret'], googleCredentials['redirectUri']);
oauth2Client.setCredentials({
    access_token: googleCredentials['accessToken'],
    refresh_token: googleCredentials['refreshToken'],
    expiry_date: true
});
google.options({
    auth: oauth2Client
});


/* Sets the title of youtube video given match
   @param match match object in json notation
   @return title string */
function getVideoTitle(match) {
    /* e.g. (Highlights) Double Kill | Support | Miss Fortune Gameplay - League of Legends | 20161101 */
    var title = '(Highlights) ';
    if ('multiKill' in match) {
        title += match['multiKill'] + ' | ';
    }
    if ('role' in match) {
        title += match['role'] + ' | ';
    }
    title += match['champion'] + ' Gameplay - League of Legends | ' + gmdate('Ymd', match['timestamp'] * 1000);
    return title;
}

/* Sets the description of youtube video given match
   @param match match object in json notation
   @return description string */
function getVideoDescription(match) {
    /* e.g.
       Type: Ranked
       Champion: Miss Fortune
       Lane: Mid
       Outcome: Victory
       Multikill: Double Kill
       Player: johnauyeung
       When: Friday‎, ‎Nov ‎11‎, ‎2016‎ ‎06‎:‎00‎ ‎AM
       KDA: 6/3/5 (3.67)
       Kill Participation: 43%
       Level: 13

       Players: a, b, c, d, e, f, g, johnauyeung, i, j */
    var role = '';
    if ('role' in match) {
        role = 'Lane: ' + match['role'] + '\n';
    }
    var multiKill = '';
    if ('multiKill' in match) {
        multiKill = 'Multikill: ' + match['multiKill'] + '\n';
    }
    var kill = match['kill'];
    var death = match['death'];
    var assist = match['assist'];
    var KDA = death == 0? 'Perfect': Math.round((kill + assist) * 100 / death) / 100;
    var summoners = match['summoners'].join(', ');
    var description = 'Type: ' + match['gameType'] + '\n' + 'Champion: ' + match['champion'] + '\n' + role + 'Outcome: ' + match['gameResult'] + '\n' + multiKill + 'Player: ' + match['summoner'] + '\n' + 'When: ' + gmdate('Y-m-d H:i:s T', match['timestamp'] * 1000) + '\n' + 'KDA: ' + kill + '/' + death + '/' + assist + ' (' + KDA + ')\n' + 'Kill Participation: ' + match['killParticipation'] + '%\n' + 'Level: ' + match['level'] + '\n' + '\n' + 'Players: ' + summoners;
    return description;
}

/* Sets the tags of youtube video given match
   @param match match object in json notation
   @return string array of tags */
function getVideoTags(match) {
    var champion = match['champion'];
    var gameType = match['gameType'];
    var summoner = match['summoner'];
    var tags = ['LOL', 'League of Legends', champion, gameType, summoner];

    if ('role' in match) {
        tags.push(match['role']);
    }

    return tags;
}

function getYoutubeUrlFromId(youtubeId) {
    return 'http://www.youtube.com/watch?v=' + youtubeId;
}


/* Searches for new matches to upload to youtube
   @return callback(newMatches), where newMatches is array of matches in json notation */
function filterMatchesToUpload(callback) {
    
    var url = encodeURI(server + '/select?where=jist_url is not null AND youtube_url is null');

    request.get(url, function(err, res) {
        if (err) {
            console.error(err);
        } else {
            callback(JSON.parse(res.body));
        }
    });
}


/* Download a jist tv video given match json object,
   to file path specified
   @param match match object in json notation 
   @param filePath path to save downloaded video */
function downloadMatchFromJist(match, filePath, callback) {
    var url = match['jistUrl'];
    if (url.includes('youtube')) {
        downloadVideoFromYoutube(url, filePath, callback);
    } else {
        downloadVideo(url, filePath, callback);
    }
}

/* Download a youtube video to file path specified
   @param url of youtube video
   @param filePath path to save downloaded video */
function downloadVideoFromYoutube(url, filePath, callback) {
    var video = ytdl(url);
    video.on('info', function(info, format) {
        console.log('Started to download from: ' + url);
    });
    var pos = 0,
        size = 0,        
        mB = 1048576;
    video.on('data', function data(chunk) {
        size += chunk.length;
        if (size - pos > 10 * mB) {
            console.log((size / mB).toFixed(1) + 'MB downloaded from: ' + url);
            pos = size;
        }
    });
    video.on('error', function() {
        console.error('Failed to download: ' + url);
        callback('Failed to download: ' + url);
        return;
    });
    video.on('end', function() {
        console.log('Download complete: ' + url);
        callback();
    });
    video.pipe(fs.createWriteStream(filePath));
}

/* Download video hosted at url to file path specified
   @param url of video
   @param filePath path to save downloaded video */
function downloadVideo(url, filePath, callback) {
    console.log('Started to download from: ' + url);
    var video = request.get(url);

    var pos = 0,
        size = 0,        
        mB = 1048576;    
    video.on('data', function data(chunk) {
        size += chunk.length;
        if (size - pos > 10 * mB) {
            console.log((size / mB).toFixed(1) + 'MB downloaded from: ' + url);
            pos = size;
        }
    });
    video.on('error', function() {
        console.error('Failed to download: ' + url);
        callback('Failed to download: ' + url);
        return;
    });
    video.on('end', function() {
        console.log('Download complete: ' + url);
        callback();
    });
    video.pipe(fs.createWriteStream(filePath));
}

/*
  When upload is finished, callback(url) of uploaded video link will be called.
  @param match match object in json notation
  @param videoFile path to video file to upload
  @param privacyStatus public/private/unlisted
  @param callback taking one argument (url of uploaded video)
*/
function uploadMatchToYoutube(match, videoFile, privacyStatus, callback) {
    console.log('Starting to upload to youtube: ' + videoFile)
    youtube.videos.insert({
        part: 'status, snippet',
        resource: {
            snippet: {
                title: getVideoTitle(match),
                description: getVideoDescription(match),
                tags: getVideoTags(match),
                categoryId: '20'
            },
            status: {
                privacyStatus: privacyStatus
            }
        },
        media: {
            body: fs.createReadStream(videoFile)
        }
    }, function(error, data) {
        if (error) {
            console.error(error);
        } else {
            var url = getYoutubeUrlFromId(data.id);
            console.log('Uploaded: ' + videoFile + ' to youtube: ' + url);
            callback(url);
        }
    });
}

function writeUrlToMatch(youtubeUrl, match, callback) {
    var url = server + '/update';
    
    match['youtubeUrl'] = youtubeUrl;

    request({
        url: url,
        method: 'POST',
        json: [match]
    }, function(err, res, body) {
        if (err) {console.error(err); callback(); return}
        console.log('Updated match with new url: ' + JSON.stringify(match));
        callback();
    });
}

function sortRecordsAscending(matchRecords, ascending) {
    var copy = matchRecords.slice();
    return copy.sort(function(r1, r2) {
        var comp = r1['timestamp'] - r2['timestamp'];
        return ascending ? comp : -comp;
    });
}

function main() {

    program
        .option('--privacyStatus <privacyStatus>', 'public/private/unlisted', /^(public|private|unlisted)$/, 'public')
        .parse(process.argv);

    filterMatchesToUpload(function(matchesToUpload) {
        var matchesInOrder = sortRecordsAscending(matchesToUpload, true);
        var urlFileMap = {};

        console.log('Matches to upload: ' + JSON.stringify(matchesInOrder));
        console.log('Detected temporary directory as: ' + os.tmpdir());
        console.log('Youtube privacy status set to: ' + program.privacyStatus);

        async.each(matchesInOrder, function(match, callback) {
            var matchId = match['matchId'];
            var summoner = match['summoner'];
            var role = ('role' in match)? match['role'] + ' ' : '';
            var filePath = path.join(os.tmpdir(), 'League of Legends lol Gameplay ' + summoner + ' ' +  role + matchId + '.mp4');
            downloadMatchFromJist(match, filePath, function(err) {
                if (!err) {
                    var jistUrl = match['jistUrl'];
                    urlFileMap[jistUrl] = filePath;
                }
                callback();
            });
        }, function(err) {
            if (err) {console.error(err); return;}
            async.eachSeries(matchesInOrder, function(match, callback) {
                var jistUrl = match['jistUrl'];
                if (!(jistUrl in urlFileMap)) {
                    // To ensure videos are uploaded in chronological order, 
                    // exit process if found video missing in the middle
                    console.error('Aborted upload as download failed: ' + match[
                        'jistUrl']);
                    process.exit(-1);
                }

                var filePath = urlFileMap[jistUrl];
                uploadMatchToYoutube(match, filePath, program.privacyStatus, function(newYoutubeUrl) {
                    fs.unlinkSync(filePath);

                    // After everything finishes, update with new url
                    writeUrlToMatch(newYoutubeUrl, match, callback);
                });
            }, function(err) {
                if (err) {console.error(err); return;}
                console.log('Finished uploding all matches');
            })
        });
    });
}

main();