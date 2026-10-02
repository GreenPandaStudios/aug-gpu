#include "aug_gpu.h"
#include <assert.h>
#include <pthread.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
static void *foreign_thread(void *value) {
  double *result = (void *)1; uint64_t count = 1; aug_native_error_v1 failure = {0};
  assert(aug_gpu_download_v1(value,&result,&count,&failure)==2);
  assert(!result && !count && failure.message_length); return NULL;
}
int main(void) {
  aug_gpu_device_v1 *device = NULL; aug_native_error_v1 error = {0};
  int status = aug_gpu_open_v1(&device, &error);
  if (status) { fwrite(error.message, 1, error.message_length, stderr); return status; }
  double a[] = {1,2,3}, b[] = {4,5,6}, invalid[] = {NAN};
  aug_gpu_buffer_v1 *left = NULL, *right = NULL, *result = NULL, *shorter = NULL;
  assert(aug_gpu_upload_v1(device,invalid,1,&result,&error)==2 && !result);
  assert(aug_gpu_upload_v1(device,a,UINT64_MAX,&result,&error)==2 && !result);
  assert(!aug_gpu_upload_v1(device,a,3,&left,&error)); assert(!aug_gpu_upload_v1(device,b,3,&right,&error));
  assert(!aug_gpu_upload_v1(device,a,1,&shorter,&error));
  assert(aug_gpu_add_v1(left,shorter,&result,&error)==2 && !result);
  aug_gpu_buffer_release_v1(shorter);
  pthread_t thread; assert(!pthread_create(&thread,NULL,foreign_thread,left)); assert(!pthread_join(thread,NULL));
  // Buffers retain only native context, so source Device cleanup cannot invalidate them.
  aug_gpu_device_release_v1(device);
  assert(!aug_gpu_add_v1(left,right,&result,&error)); double *values; uint64_t count;
  assert(!aug_gpu_download_v1(result,&values,&count,&error)); assert(count==3 && values[0]==5 && values[1]==7 && values[2]==9);
  aug_gpu_values_release_v1(values); aug_gpu_buffer_release_v1(result); aug_gpu_buffer_release_v1(right); aug_gpu_buffer_release_v1(left);
  assert(aug_gpu_live_resources_v1()==0);
  assert(!aug_gpu_open_v1(&device,&error));
  assert(!aug_gpu_upload_v1(device,NULL,0,&left,&error));assert(!aug_gpu_upload_v1(device,NULL,0,&right,&error));
  assert(!aug_gpu_add_v1(left,right,&result,&error));assert(!aug_gpu_download_v1(result,&values,&count,&error)&&count==0);
  aug_gpu_values_release_v1(values); aug_gpu_buffer_release_v1(result);aug_gpu_buffer_release_v1(left);aug_gpu_buffer_release_v1(right);aug_gpu_device_release_v1(device);
  assert(aug_gpu_live_resources_v1()==0); puts("real Metal add, bounds, affinity and cleanup passed");
}
