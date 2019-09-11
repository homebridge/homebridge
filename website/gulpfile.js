var gulp = require('gulp');
var sass = require('gulp-sass');
var clean = require('gulp-clean');
var browserSync = require('browser-sync').create();

gulp.task('sass', function () {
  return gulp.src('./styles/*.scss')
    .pipe(sass({outputStyle: 'compressed'}))
    .pipe(gulp.dest('./css'))
    .pipe(browserSync.reload({
      stream: true
    }))
});

gulp.task('clean', function(){
  return gulp.src(['./css/*'], {read:false})
    .pipe(clean());
});

gulp.task('browser-sync', function() {
    browserSync.init({
        server: {
            baseDir: "../"
        }
    });
});

gulp.task('build', ['clean', 'browser-sync'], function() {
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
