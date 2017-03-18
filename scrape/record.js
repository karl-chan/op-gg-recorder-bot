/**
 * This class provides functionality to poll op.gg and save gameplays.
 * Usage:
 *   casperjs record.js (<region code>:<username>)*
 */

function record(regionCode, userName) {

    var url = 'http://' + regionCode + '.op.gg/summoner/userName=' + userName;

    casper.then(function showTargetUrl() {
        this.log('Navigating to: ' + url, 'info')
    })

    casper.thenOpenWithRetries(url,
        function showCurrentUrl() {
            casper.log('Page loaded: ' + url, 'info');
        });

    casper.thenClick('#SummonerRefreshButton',
        function clickRefreshButton() {
            casper.log('Refreshed: ' + userName, 'info');
        });

    casper.thenClick('#SpectateButton',
        function clickLiveGameButton() {
            casper.log('Clicked live game button: ' + userName, 'info');
        });

    casper.then(function waitForLiveGameStatus() {
        this.waitForSelector('.Button.SemiRound.Red.tip, .NowRecording.tip, .Message',
            function recordGame() {
                if (this.exists('.Button.SemiRound.Red.tip')) {
                    this.click('.Button.SemiRound.Red.tip');
                    this.log('Started recording: ' + userName, 'info');
                } else if (this.exists('.NowRecording.tip')) {
                    this.log('Already recording: ' + userName, 'info');
                } else {
                    this.log('Not in game: ' + userName, 'info');
                }
            },
            function onTimeout() {
                this.log('Timed out for: ' + userName, 'info');
            },
            10000);
    });
}



"use strict";

var casper = require('casper').create({
    verbose: true,
    logLevel: 'info'
});

casper.thenOpenWithRetries = function(url, then) {
    return this.thenOpen(url, function checkResponseCode(response) {
        if (response == undefined || response.status != 200) {            
            this.log('Retrying in 10 seconds...', 'info');
            this.then(function waitTenSeconds() {
                this.wait(10000, function() {
                    this.thenOpenWithRetries(url, then);
                });
            });
        } else {
            this.then(then);
        }
    });
};

casper.on('error', function(err) {
    this.log(err, 'error');
    this.exit(-1);
})

casper.userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36');
casper.start();
for (var i = 0; i < casper.cli.args.length; i++) {
    var params = casper.cli.get(i).split(':')
    var region = params[0]
    var user = params[1]
    record(region, user);
}
casper.run();