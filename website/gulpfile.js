
var gulp = require('gulp');
var sass = require('gulp-sass');
var gulpif = require('gulp-if');
var clean = require('gulp-clean');
var useref = require('gulp-useref');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');

gulp.task('sass', function () {
  return gulp.src('./styles/*.scss')
            .pipe(sass())
            .pipe(gulp.dest('./css'));
});

gulp.task('clean', function(){
  return gulp.src(['./css/*'], {read:false})
    .pipe(clean());
});

gulp.task('build', ['clean'], function() {
  gulp.run(['sass']);
});

gulp.task('default', [
  'build',
  'watch'
]);

// Rerun the task when a file changes
gulp.task('watch', function() {
  gulp.watch('./styles/*.scss', ['sass'])
});
