var gulp = require('gulp');
var sass = require('gulp-sass');
var clean = require('gulp-clean');

gulp.task('sass', function () {
  return gulp.src('./styles/*.scss')
    .pipe(sass({outputStyle: 'compressed'}))
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
