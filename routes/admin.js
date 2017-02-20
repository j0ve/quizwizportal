var express = require('express');
var cookieParser = require('cookie-parser');
// library for promises, zodat ik ook dingen synchroon kan doen (in de strijd tegen callback hell, voor queryies die afhankelijk zijn van queries etc)
var q = require('q');
var router = express.Router();
router.use(cookieParser());
// node pakketje om korte uniqe ids te maken
var shortid = require('shortid');
// mysql incliden en verbinding maken met db
var mysql = require('mysql');
var pool = mysql.createPool({
    host: 'localhost',
    user: 'quizwiz',
    password: 'v00rk3nn1s',
    database: 'quizwiz'
});

function getConnectionFromPool() {
    var deferred = q.defer();
    pool.getConnection(function(err, connection) {
        deferred.resolve(connection);
    });
    return deferred.promise;
}

function doQuery(queryTemplate, parameters) {
    var deferred = q.defer();
    getConnectionFromPool()
        .then(function(connection) {
            var query = mysql.format(queryTemplate, parameters);
            console.log('Query to execute:' + query);
            connection.query(query, function(error, result) {
                if (error) {
                    console.error(error);
                    deferred.reject(error);
                }
                connection.release();
                deferred.resolve(result);
            });
        })
        .fail(function(err) {
            console.error(JSON.stringify(err));
            deferred.reject(err);
        });

    return deferred.promise;
}


function saveHPQuestion(question, cookieId) {
    var deferred = q.defer();
    doQuery('INSERT INTO TEMP_homepage_questions SET question=?, createdbycookie=?', [question.text, cookieId]).then(function(data) {
        var question_id = data.insertId;
        var answerpromises = [];
        for (var i = 0; i < question.answers.length; i++) {
            answerpromises.push(doQuery('INSERT INTO TEMP_homepage_answers SET question_id=?, answer=?, correct=?, displayorder=?', [data.insertId, question.answers[i].text, question.answers[i].correct, i]));
        }
        q.all(answerpromises).done(function(data2) {
            deferred.resolve(data);
        });
    });
    return deferred.promise;
}
// zelf gemaakte middleware om te checken of het quizwiz koekje bestaat, en zo niet, maken die handel
router.use('/', function(req, res, next) {
    // check if client sent cookie
    if (!("quizwizcookieid" in req.cookies)) {
        // no: set a new cookie
        var uniqid = shortid.generate();
        res.cookie('quizwizcookieid', uniqid, { maxAge: 2147483647, httpOnly: true });
        req.cookies.quizwizcookieid = uniqid;
    } else {
        // yes, cookie was already present 
    }
    next(); // <-- important! want hij moet de rest van de pagina nog ladennnnnn
});
router.get('/', function(req, res, next) {
    res.render('admin');
});
router.post('/hpadminsavequestion', function(req, res, next) {
    saveHPQuestion(req.body, req.cookies.quizwizcookieid).done(function(data) {
        console.log(data);
        res.json(data);
    });
});
module.exports = router;